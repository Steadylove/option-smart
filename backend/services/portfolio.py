"""Shared portfolio data loading — used by both analysis and stress test APIs."""

import asyncio
import logging
import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.market_hours import is_us_market_open
from backend.core.position_analyzer import (
    MULTIPLIER,
    diagnose_position,
    diagnose_stock_position,
    estimate_position_margin,
)
from backend.models.position import Position
from backend.models.schemas import PositionDiagnosis, PositionOut
from backend.services.longbridge import get_option_quotes, get_stock_quotes
from backend.services.margin import get_im_factor

logger = logging.getLogger(__name__)

_CACHE_TTL = 30  # 30s during market hours
_CACHE_TTL_CLOSED = 600  # 10min when market is closed
_diagnoses_cache: list[PositionDiagnosis] | None = None
_diagnoses_ts: float = 0
_diagnoses_lock = asyncio.Lock()


async def load_diagnoses(db: AsyncSession) -> list[PositionDiagnosis]:
    """Load open positions with TTL cache to avoid repeated API calls."""
    global _diagnoses_cache, _diagnoses_ts

    ttl = _CACHE_TTL if is_us_market_open() else _CACHE_TTL_CLOSED
    if _diagnoses_cache is not None and (time.monotonic() - _diagnoses_ts) < ttl:
        return _diagnoses_cache

    async with _diagnoses_lock:
        # double-check after acquiring lock
        if _diagnoses_cache is not None and (time.monotonic() - _diagnoses_ts) < ttl:
            return _diagnoses_cache

        result = await _fetch_diagnoses(db)
        _diagnoses_cache = result
        _diagnoses_ts = time.monotonic()
        return result


def invalidate_diagnoses_cache() -> None:
    """Call after position changes (open/close/update) to clear stale data."""
    global _diagnoses_cache, _diagnoses_ts
    _diagnoses_cache = None
    _diagnoses_ts = 0


async def _fetch_diagnoses(db: AsyncSession) -> list[PositionDiagnosis]:
    """Load open positions, fetch market data, build diagnoses."""
    stmt = (
        select(Position)
        .where(Position.status == "open")
        .order_by(Position.position_type, Position.expiry)
    )
    result = await db.execute(stmt)
    positions = result.scalars().all()

    if not positions:
        return []

    symbol_set = {p.symbol for p in positions}
    option_symbols = [
        p.option_symbol for p in positions if p.position_type == "option" and p.option_symbol
    ]

    stock_data = get_stock_quotes(tuple(sorted(symbol_set)))
    spot_map = {q["symbol"]: float(q["last_done"]) for q in stock_data}

    opt_map: dict[str, dict] = {}
    if option_symbols:
        try:
            opt_data = get_option_quotes(tuple(sorted(option_symbols)))
            opt_map = {q["symbol"]: q for q in opt_data}
        except Exception as e:
            logger.warning("Failed to fetch option quotes: %s — using fallback", e)

    diagnoses: list[PositionDiagnosis] = []
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

    _apply_margin_estimates(diagnoses)
    return diagnoses


def _apply_margin_estimates(diagnoses: list[PositionDiagnosis]) -> None:
    """Post-process: estimate margin using broker's actual margin factors."""
    stock_syms = {
        d.position.symbol
        for d in diagnoses
        if d.position.position_type == "stock" and d.position.direction in ("buy", "long")
    }

    for d in diagnoses:
        p = d.position
        is_covered = (
            p.position_type == "option"
            and p.direction == "sell"
            and p.option_type == "call"
            and p.symbol in stock_syms
        )
        d.estimated_margin = estimate_position_margin(
            direction=p.direction,
            option_type=p.option_type,
            position_type=p.position_type,
            spot=d.current_spot,
            strike=p.strike,
            option_price=d.pnl.current_price,
            quantity=p.quantity,
            is_covered=is_covered,
            im_factor=get_im_factor(p.symbol),
        )

        if d.theta_per_day > 0 and p.position_type == "option":
            # 保证金年化: 每 $1 保证金的年化 theta 收益
            if d.estimated_margin > 0:
                d.margin_return_ann = round(d.theta_per_day * 365 / d.estimated_margin * 100, 1)

            # risk-adjusted ann.: theta relative to max potential loss
            # put max_loss = strike * 100 * qty; call uses 2x spot as proxy
            if p.option_type == "put" and p.strike:
                max_loss = p.strike * MULTIPLIER * p.quantity
            else:
                max_loss = d.current_spot * 2 * MULTIPLIER * p.quantity
            if max_loss > 0:
                d.risk_return_ann = round(d.theta_per_day * 365 / max_loss * 100, 1)
