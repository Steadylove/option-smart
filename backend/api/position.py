"""Position CRUD and analysis API routes."""

import logging
import re
import time
from datetime import date, datetime
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.position_analyzer import (
    build_portfolio_summary,
    diagnose_position,
    diagnose_stock_position,
)
from backend.models.database import get_db
from backend.models.position import Position
from backend.models.schemas import (
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
    get_account_positions,
    get_option_quotes,
    get_stock_quotes,
)

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
    return pos


@router.put("/{position_id}", response_model=PositionOut)
async def update_position(
    position_id: int,
    body: PositionUpdate,
    db: AsyncSession = Depends(get_db),
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
    return pos


@router.delete("/{position_id}", status_code=204)
async def delete_position(
    position_id: int,
    db: AsyncSession = Depends(get_db),
):
    pos = await db.get(Position, position_id)
    if not pos:
        raise HTTPException(404, "Position not found")
    await db.delete(pos)
    await db.commit()
    with _analysis_cache_lock:
        _analysis_cache.clear()


@router.post("/{position_id}/close", response_model=PositionOut)
async def close_position(
    position_id: int,
    close_price: float = Query(...),
    db: AsyncSession = Depends(get_db),
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
    return pos


# ── Analysis ─────────────────────────────────────────────


@router.get("/analysis", response_model=PositionAnalysisResponse)
async def analyze_positions(
    db: AsyncSession = Depends(get_db),
):
    """Full portfolio analysis with server-side result caching."""
    # Return cached result if fresh enough
    with _analysis_cache_lock:
        if "result" in _analysis_cache:
            expires_at, cached_result = _analysis_cache["result"]
            if time.monotonic() < expires_at:
                logger.debug("Analysis cache HIT")
                return cached_result

    stmt = (
        select(Position)
        .where(Position.status == "open")
        .order_by(Position.position_type, Position.expiry)
    )
    result = await db.execute(stmt)
    positions = result.scalars().all()

    if not positions:
        empty_response = PositionAnalysisResponse(
            portfolio=build_portfolio_summary([]),
            positions=[],
            updated_at=datetime.now().isoformat(),
        )
        return empty_response

    symbol_set = {p.symbol for p in positions}
    option_symbols = [
        p.option_symbol for p in positions if p.position_type == "option" and p.option_symbol
    ]

    try:
        stock_data = get_stock_quotes(tuple(sorted(symbol_set)))
        spot_map = {q["symbol"]: float(q["last_done"]) for q in stock_data}
    except Exception as e:
        logger.error("Failed to fetch spot prices: %s", e)
        raise HTTPException(502, "Failed to fetch market data")

    opt_map: dict[str, dict] = {}
    if option_symbols:
        try:
            opt_data = get_option_quotes(tuple(sorted(option_symbols)))
            opt_map = {q["symbol"]: q for q in opt_data}
        except Exception as e:
            logger.warning("Failed to fetch option quotes: %s — using fallback", e)

    diagnoses = []
    for pos in positions:
        pos_out = PositionOut.model_validate(pos)
        spot = spot_map.get(pos.symbol, 0)

        if pos.position_type == "option" and pos.option_symbol:
            oq = opt_map.get(pos.option_symbol)
            current_price = float(oq["last_done"]) if oq else pos.open_price
            iv = float(oq["implied_volatility"]) if oq and oq.get("implied_volatility") else 0.5
            diag = diagnose_position(pos_out, spot, current_price, iv)
        else:
            diag = diagnose_stock_position(pos_out, spot)

        diagnoses.append(diag)

    priority = {HealthLevel.danger: 0, HealthLevel.warning: 1, HealthLevel.safe: 2}
    diagnoses.sort(key=lambda d: (priority.get(d.health.level, 9), d.dte))

    portfolio = build_portfolio_summary(diagnoses)

    response = PositionAnalysisResponse(
        portfolio=portfolio,
        positions=diagnoses,
        updated_at=datetime.now().isoformat(),
    )

    with _analysis_cache_lock:
        _analysis_cache["result"] = (time.monotonic() + _ANALYSIS_CACHE_TTL, response)

    return response


# ── Sync from brokerage ─────────────────────────────────


class SyncResult(BaseModel):
    synced: int
    skipped: int
    details: list[str]


@router.post("/sync", response_model=SyncResult)
async def sync_positions_from_broker(
    db: AsyncSession = Depends(get_db),
):
    """Sync all positions (stocks + options) from Longbridge brokerage account."""
    try:
        broker_positions = get_account_positions()
    except Exception as e:
        logger.error("Failed to fetch broker positions: %s", e)
        raise HTTPException(502, f"Failed to connect to brokerage: {e}")

    # Load existing open symbols to avoid duplicates
    stmt = select(Position).where(Position.status == "open")
    result = await db.execute(stmt)
    existing = result.scalars().all()
    existing_option_symbols = {p.option_symbol for p in existing if p.option_symbol}
    existing_stock_symbols = {p.symbol for p in existing if p.position_type == "stock"}

    synced = 0
    skipped = 0
    details: list[str] = []

    for bp in broker_positions:
        sym = bp["symbol"]
        qty = bp["quantity"]
        if qty == 0:
            continue

        cost_price = float(bp["cost_price"]) if bp["cost_price"] != "0" else 0
        parsed = _parse_option_symbol(sym)

        if parsed:
            # ── Option position ──
            if sym in existing_option_symbols:
                skipped += 1
                details.append(f"Skipped {sym} (already exists)")
                continue

            direction = "sell" if qty < 0 else "buy"
            abs_qty = abs(qty)

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
            # ── Stock / ETF position ──
            if sym in existing_stock_symbols:
                skipped += 1
                details.append(f"Skipped {sym} (already exists)")
                continue

            direction = "sell" if qty < 0 else "long"
            abs_qty = abs(qty)

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

    if synced > 0:
        await db.commit()
        # Invalidate caches after new positions are added
        with _analysis_cache_lock:
            _analysis_cache.clear()
        clear_lb_cache()

    logger.info("Position sync complete: %d synced, %d skipped", synced, skipped)
    return SyncResult(synced=synced, skipped=skipped, details=details)
