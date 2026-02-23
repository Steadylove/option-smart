"""Shared portfolio data loading — used by both analysis and stress test APIs."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.position_analyzer import diagnose_position, diagnose_stock_position
from backend.models.position import Position
from backend.models.schemas import PositionDiagnosis, PositionOut
from backend.services.longbridge import get_option_quotes, get_stock_quotes

logger = logging.getLogger(__name__)


async def load_diagnoses(db: AsyncSession) -> list[PositionDiagnosis]:
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

    return diagnoses
