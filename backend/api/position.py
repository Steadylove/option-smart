"""Position CRUD and analysis API routes."""

import asyncio
import logging
import re
import time
from datetime import date, datetime
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_session
from backend.config import settings
from backend.core.decision_matrix import build_decision_matrix
from backend.core.position_analyzer import build_portfolio_summary, build_symbol_summaries
from backend.models.database import get_db
from backend.models.position import Position
from backend.models.schemas import (
    AccountRisk,
    ActionAlternative,
    DecisionMatrixResponse,
    HealthLevel,
    PositionAnalysisResponse,
    PositionCreate,
    PositionOut,
    PositionUpdate,
)
from backend.services.longbridge import (
    clear_cache as clear_lb_cache,
)
from backend.services.longbridge import (
    get_account_balance,
    get_account_positions,
)
from backend.services.portfolio import invalidate_diagnoses_cache, load_diagnoses

# ── Analysis result cache ────────────────────────────────
_analysis_cache: dict[str, tuple[float, object]] = {}
_analysis_cache_lock = Lock()
_ANALYSIS_CACHE_TTL = 30  # seconds

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/positions", tags=["positions"])

# US option symbol pattern: TQQQ250321P00060000.US
_OPTION_SYMBOL_RE = re.compile(
    r"^(?P<underlying>[A-Z]+)"
    r"(?P<yy>\d{2})(?P<mm>\d{2})(?P<dd>\d{2})"
    r"(?P<cp>[CP])"
    r"(?P<strike>\d+)"
    r"\.US$"
)


def _parse_option_symbol(symbol: str) -> dict | None:
    """Extract underlying, expiry, type, strike from a US option symbol."""
    m = _OPTION_SYMBOL_RE.match(symbol)
    if not m:
        return None
    yy, mm, dd = int(m.group("yy")), int(m.group("mm")), int(m.group("dd"))
    strike_raw = int(m.group("strike"))
    # OCC format: strike * 1000, so divide by 1000
    strike = strike_raw / 1000.0
    return {
        "underlying": m.group("underlying"),
        "expiry": date(2000 + yy, mm, dd),
        "option_type": "call" if m.group("cp") == "C" else "put",
        "strike": strike,
    }


# ── CRUD ─────────────────────────────────────────────────


@router.get("", response_model=list[PositionOut])
async def list_positions(
    status: str = Query("open", description="Filter by status"),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_session),
):
    stmt = (
        select(Position)
        .where(Position.status == status)
        .order_by(Position.position_type, Position.expiry)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=PositionOut, status_code=201)
async def create_position(
    body: PositionCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_session),
):
    is_option = body.position_type == "option"
    multiplier = 100 if is_option else 1
    cost = body.cost_basis or (body.open_price * body.quantity * multiplier)

    pos = Position(
        position_type=body.position_type,
        symbol=body.symbol,
        option_symbol=body.option_symbol,
        option_type=body.option_type.value if body.option_type else None,
        direction=body.direction.value,
        strike=body.strike,
        expiry=body.expiry,
        quantity=body.quantity,
        open_price=body.open_price,
        open_date=body.open_date,
        cost_basis=cost,
        strategy=body.strategy.value,
        notes=body.notes,
        status="open",
    )
    db.add(pos)
    await db.commit()
    await db.refresh(pos)
    with _analysis_cache_lock:
        _analysis_cache.clear()
    invalidate_diagnoses_cache()
    return pos


@router.put("/{position_id}", response_model=PositionOut)
async def update_position(
    position_id: int,
    body: PositionUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_session),
):
    pos = await db.get(Position, position_id)
    if not pos:
        raise HTTPException(404, "Position not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if hasattr(value, "value"):
            value = value.value
        setattr(pos, field, value)

    pos.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(pos)
    with _analysis_cache_lock:
        _analysis_cache.clear()
    invalidate_diagnoses_cache()
    return pos


@router.delete("/{position_id}", status_code=204)
async def delete_position(
    position_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_session),
):
    pos = await db.get(Position, position_id)
    if not pos:
        raise HTTPException(404, "Position not found")
    await db.delete(pos)
    await db.commit()
    with _analysis_cache_lock:
        _analysis_cache.clear()
    invalidate_diagnoses_cache()


@router.post("/{position_id}/close", response_model=PositionOut)
async def close_position(
    position_id: int,
    close_price: float = Query(...),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_session),
):
    """Close a position and calculate realized P&L."""
    pos = await db.get(Position, position_id)
    if not pos:
        raise HTTPException(404, "Position not found")
    if pos.status != "open":
        raise HTTPException(400, "Position already closed")

    multiplier = 100 if pos.position_type == "option" else 1
    cost_value = pos.open_price * pos.quantity * multiplier
    close_value = close_price * pos.quantity * multiplier

    realized = cost_value - close_value if pos.direction == "sell" else close_value - cost_value

    pos.status = "closed"
    pos.close_price = close_price
    pos.close_date = datetime.utcnow().date()
    pos.realized_pnl = round(realized, 2)
    pos.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(pos)
    with _analysis_cache_lock:
        _analysis_cache.clear()
    invalidate_diagnoses_cache()
    return pos


def _build_account_risk(diagnoses: list) -> AccountRisk | None:
    """Build account risk summary from Longbridge balance + estimated margins."""
    try:
        bal = get_account_balance()
    except Exception as e:
        logger.warning("Failed to fetch account balance: %s", e)
        return None

    net_assets = float(bal.get("net_assets", 0))
    init_margin = float(bal.get("init_margin", 0))
    maintenance = float(bal.get("maintenance_margin", 0))
    buy_power = float(bal.get("buy_power", 0))
    risk_level = int(bal.get("risk_level", 0))
    total_cash = float(bal.get("total_cash", 0))
    max_finance = float(bal.get("max_finance_amount", 0))
    remaining_finance = float(bal.get("remaining_finance_amount", 0))

    total_est = sum(d.estimated_margin for d in diagnoses)
    freeable = sum(
        d.estimated_margin for d in diagnoses if d.pnl.unrealized_pnl > 0 and d.estimated_margin > 0
    )
    utilization = (init_margin / net_assets) if net_assets > 0 else 0

    # margin safety buffer: how far from maintenance margin call
    margin_safety = ((net_assets - maintenance) / net_assets * 100) if net_assets > 0 else 0

    option_theta = sum(
        d.theta_per_day
        for d in diagnoses
        if d.position.position_type == "option" and d.theta_per_day > 0
    )
    option_margin = sum(
        d.estimated_margin
        for d in diagnoses
        if d.position.position_type == "option" and d.estimated_margin > 0
    )
    theta_daily = (option_theta / option_margin) if option_margin > 0 else 0
    theta_ann = theta_daily * 365 * 100

    return AccountRisk(
        net_assets=round(net_assets, 2),
        init_margin=round(init_margin, 2),
        maintenance_margin=round(maintenance, 2),
        buy_power=round(buy_power, 2),
        margin_call=float(bal.get("margin_call", 0)),
        risk_level=risk_level,
        margin_utilization=round(utilization * 100, 1),
        total_estimated_margin=round(total_est, 2),
        profitable_margin_freeable=round(freeable, 2),
        theta_yield_daily=round(theta_daily, 6),
        theta_yield_ann=round(theta_ann, 1),
        total_cash=round(total_cash, 2),
        max_finance_amount=round(max_finance, 2),
        remaining_finance_amount=round(remaining_finance, 2),
        margin_safety_pct=round(margin_safety, 1),
    )


# ── Analysis ─────────────────────────────────────────────


@router.get("/analysis", response_model=PositionAnalysisResponse)
async def analyze_positions(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_session),
):
    """Full portfolio analysis with server-side result caching."""
    with _analysis_cache_lock:
        if "result" in _analysis_cache:
            expires_at, cached_result = _analysis_cache["result"]
            if time.monotonic() < expires_at:
                logger.debug("Analysis cache HIT")
                return cached_result

    try:
        diagnoses = await load_diagnoses(db)
    except Exception as e:
        logger.error("Failed to build portfolio analysis: %s", e)
        raise HTTPException(502, "Failed to fetch market data")

    priority = {HealthLevel.danger: 0, HealthLevel.warning: 1, HealthLevel.safe: 2}
    diagnoses.sort(key=lambda d: (priority.get(d.health.level, 9), d.dte))

    portfolio = build_portfolio_summary(diagnoses)
    by_symbol = build_symbol_summaries(diagnoses)
    account_risk = _build_account_risk(diagnoses)

    response = PositionAnalysisResponse(
        portfolio=portfolio,
        by_symbol=by_symbol,
        account_risk=account_risk,
        positions=diagnoses,
        updated_at=datetime.now().isoformat(),
    )

    with _analysis_cache_lock:
        _analysis_cache["result"] = (time.monotonic() + _ANALYSIS_CACHE_TTL, response)

    return response


# ── Positions assistant (lightweight AI Q&A) ─────────────


class AskRequest(BaseModel):
    question: str
    messages: list[dict] = []
    context: str = ""
    deep_thinking: bool = False


@router.post("/ask")
async def positions_ask(
    body: AskRequest,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_session),
):
    """Lightweight SSE streaming Q&A about current positions data."""
    from backend.services.ai import positions_assistant_stream

    try:
        diagnoses = await load_diagnoses(db)
    except Exception:
        diagnoses = []

    chat_messages = [*body.messages, {"role": "user", "content": body.question}]

    def _sse_data(text: str) -> str:
        lines = text.split("\n")
        return "".join(f"data: {line}\n" for line in lines) + "\n"

    async def event_stream():
        async for chunk in positions_assistant_stream(
            chat_messages, body.context, diagnoses, deep_thinking=body.deep_thinking
        ):
            if chunk.startswith("[TOOL:"):
                yield f"event: tool\ndata: {chunk[6:-1]}\n\n"
            elif chunk.startswith("[THINKING]"):
                yield f"event: thinking\n{_sse_data(chunk[10:])}"
            else:
                yield _sse_data(chunk)
            await asyncio.sleep(0)
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# ── Sync from brokerage ─────────────────────────────────


class SyncResult(BaseModel):
    synced: int
    updated: int
    closed: int
    skipped: int
    details: list[str]


@router.post("/sync", response_model=SyncResult)
async def sync_positions_from_broker(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_session),
):
    """Sync all positions (stocks + options) from Longbridge brokerage account."""
    try:
        broker_positions = get_account_positions()
    except Exception as e:
        logger.error("Failed to fetch broker positions: %s", e)
        raise HTTPException(502, f"Failed to connect to brokerage: {e}")

    stmt = select(Position).where(Position.status == "open")
    result = await db.execute(stmt)
    existing = result.scalars().all()

    # Build lookup maps: key → existing Position object
    option_map: dict[str, Position] = {}
    stock_map: dict[str, Position] = {}
    for p in existing:
        if p.option_symbol:
            option_map[p.option_symbol] = p
        elif p.position_type == "stock":
            stock_map[p.symbol] = p

    synced = 0
    updated = 0
    skipped = 0
    details: list[str] = []
    broker_option_syms: set[str] = set()
    broker_stock_syms: set[str] = set()

    for bp in broker_positions:
        sym = bp["symbol"]
        qty = bp["quantity"]
        if qty == 0:
            continue

        cost_price = float(bp["cost_price"]) if bp["cost_price"] != "0" else 0
        parsed = _parse_option_symbol(sym)
        direction = "sell" if qty < 0 else ("buy" if parsed else "long")
        abs_qty = abs(qty)

        if parsed:
            broker_option_syms.add(sym)
            existing_pos = option_map.get(sym)

            if existing_pos:
                # Compare & update if changed
                changes = []
                if existing_pos.quantity != abs_qty:
                    changes.append(f"qty {existing_pos.quantity}→{abs_qty}")
                    existing_pos.quantity = abs_qty
                if abs(existing_pos.open_price - cost_price) > 0.001:
                    changes.append(f"cost ${existing_pos.open_price:.2f}→${cost_price:.2f}")
                    existing_pos.open_price = cost_price
                    existing_pos.cost_basis = cost_price * abs_qty * 100
                if existing_pos.direction != direction:
                    changes.append(f"dir {existing_pos.direction}→{direction}")
                    existing_pos.direction = direction

                if changes:
                    existing_pos.updated_at = datetime.utcnow()
                    updated += 1
                    details.append(f"Updated {sym}: {', '.join(changes)}")
                else:
                    skipped += 1
                continue

            pos = Position(
                position_type="option",
                symbol=f"{parsed['underlying']}.US",
                option_symbol=sym,
                option_type=parsed["option_type"],
                direction=direction,
                strike=parsed["strike"],
                expiry=parsed["expiry"],
                quantity=abs_qty,
                open_price=cost_price,
                open_date=date.today(),
                cost_basis=cost_price * abs_qty * 100,
                strategy=(
                    "csp"
                    if parsed["option_type"] == "put" and direction == "sell"
                    else "cc"
                    if parsed["option_type"] == "call" and direction == "sell"
                    else "custom"
                ),
                notes="Synced from Longbridge",
                status="open",
            )
            db.add(pos)
            synced += 1
            details.append(
                f"Option: {direction.upper()} {abs_qty}x "
                f"{parsed['underlying']} ${parsed['strike']} "
                f"{parsed['option_type'].upper()} exp {parsed['expiry']}"
            )
        else:
            broker_stock_syms.add(sym)
            existing_pos = stock_map.get(sym)

            if existing_pos:
                changes = []
                if existing_pos.quantity != abs_qty:
                    changes.append(f"qty {existing_pos.quantity}→{abs_qty}")
                    existing_pos.quantity = abs_qty
                if abs(existing_pos.open_price - cost_price) > 0.001:
                    changes.append(f"cost ${existing_pos.open_price:.2f}→${cost_price:.2f}")
                    existing_pos.open_price = cost_price
                    existing_pos.cost_basis = cost_price * abs_qty
                if existing_pos.direction != direction:
                    changes.append(f"dir {existing_pos.direction}→{direction}")
                    existing_pos.direction = direction

                if changes:
                    existing_pos.updated_at = datetime.utcnow()
                    updated += 1
                    details.append(f"Updated {sym}: {', '.join(changes)}")
                else:
                    skipped += 1
                continue

            pos = Position(
                position_type="stock",
                symbol=sym,
                option_symbol=None,
                option_type=None,
                direction=direction,
                strike=None,
                expiry=None,
                quantity=abs_qty,
                open_price=cost_price,
                open_date=date.today(),
                cost_basis=cost_price * abs_qty,
                strategy="stock",
                notes="Synced from Longbridge",
                status="open",
            )
            db.add(pos)
            synced += 1
            name = bp.get("symbol_name", sym)
            details.append(
                f"Stock: {direction.upper()} {abs_qty} shares {sym} ({name}) @ ${cost_price:.2f}"
            )

    # Auto-close positions that no longer exist in broker
    closed = 0
    for opt_sym, pos in option_map.items():
        if opt_sym not in broker_option_syms:
            pos.status = "closed"
            pos.close_date = date.today()
            pos.updated_at = datetime.utcnow()
            closed += 1
            details.append(f"Closed {opt_sym} (no longer in broker)")
    for stock_sym, pos in stock_map.items():
        if stock_sym not in broker_stock_syms:
            pos.status = "closed"
            pos.close_date = date.today()
            pos.updated_at = datetime.utcnow()
            closed += 1
            details.append(f"Closed {stock_sym} (no longer in broker)")

    if synced > 0 or updated > 0 or closed > 0:
        await db.commit()
        with _analysis_cache_lock:
            _analysis_cache.clear()
        invalidate_diagnoses_cache()
        clear_lb_cache()

    logger.info(
        "Position sync: %d new, %d updated, %d closed, %d unchanged",
        synced,
        updated,
        closed,
        skipped,
    )
    return SyncResult(
        synced=synced, updated=updated, closed=closed, skipped=skipped, details=details
    )


# ── Decision matrix ──────────────────────────────────────


@router.get("/{position_id}/decisions", response_model=DecisionMatrixResponse)
async def get_decision_matrix(
    position_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_session),
):
    """Generate action alternatives for a single position."""
    try:
        diagnoses = await load_diagnoses(db)
    except Exception as e:
        logger.error("Failed to load portfolio for decisions: %s", e)
        raise HTTPException(502, "Failed to fetch market data")

    diag = next((d for d in diagnoses if d.position.id == position_id), None)
    if not diag:
        raise HTTPException(404, "Position not found or not open")

    p = diag.position
    underlying = p.symbol if ".US" in p.symbol else f"{p.symbol}.US"
    q = settings.dividend_yields.get(underlying, 0.0)

    actions_raw = build_decision_matrix(diag, settings.risk_free_rate, q)
    actions = [ActionAlternative(**a) for a in actions_raw]

    sym = p.symbol.replace(".US", "")
    label = (
        f"{sym} ${p.strike} {(p.option_type or '').upper()}" if p.position_type == "option" else sym
    )

    return DecisionMatrixResponse(
        position_id=position_id,
        label=label,
        current_pnl=diag.pnl.unrealized_pnl,
        health_score=diag.health.score,
        actions=actions,
    )
