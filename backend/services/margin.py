"""Margin ratio service — fetch from Longbridge, persist to DB, provide cached reads."""

import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.margin_ratio import SymbolMarginRatio
from backend.services.longbridge import get_margin_ratio

logger = logging.getLogger(__name__)

# In-memory cache: symbol → {im_factor, mm_factor, fm_factor}
_cache: dict[str, dict[str, float]] = {}

DEFAULT_FACTORS = {"im_factor": 0.5, "mm_factor": 0.35, "fm_factor": 0.3}


async def load_all(db: AsyncSession) -> None:
    """Load all persisted margin ratios into memory cache."""
    global _cache
    result = await db.execute(select(SymbolMarginRatio))
    rows = result.scalars().all()
    _cache = {
        r.symbol: {"im_factor": r.im_factor, "mm_factor": r.mm_factor, "fm_factor": r.fm_factor}
        for r in rows
    }
    logger.info("Loaded %d margin ratios into cache", len(_cache))


def get_im_factor(symbol: str) -> float:
    """Synchronous read from cache. Falls back to 0.5 if unknown."""
    return _cache.get(symbol, DEFAULT_FACTORS)["im_factor"]


def get_factors(symbol: str) -> dict[str, float]:
    """Return all three factors from cache."""
    return _cache.get(symbol, DEFAULT_FACTORS).copy()


def get_all_cached() -> dict[str, dict[str, float]]:
    """Return the entire cache."""
    return _cache.copy()


async def fetch_and_persist(symbol: str, db: AsyncSession) -> dict[str, float]:
    """Fetch margin ratio from Longbridge API and save to DB + cache."""
    try:
        data = get_margin_ratio(symbol)
    except Exception as e:
        logger.warning("Failed to fetch margin ratio for %s: %s", symbol, e)
        return DEFAULT_FACTORS.copy()

    result = await db.execute(select(SymbolMarginRatio).where(SymbolMarginRatio.symbol == symbol))
    row = result.scalar_one_or_none()

    if row:
        row.im_factor = data["im_factor"]
        row.mm_factor = data["mm_factor"]
        row.fm_factor = data["fm_factor"]
        row.updated_at = datetime.utcnow()
    else:
        row = SymbolMarginRatio(
            symbol=symbol,
            im_factor=data["im_factor"],
            mm_factor=data["mm_factor"],
            fm_factor=data["fm_factor"],
        )
        db.add(row)

    await db.commit()
    _cache[symbol] = data
    logger.info(
        "Margin ratio for %s: im=%.2f mm=%.2f fm=%.2f",
        symbol,
        data["im_factor"],
        data["mm_factor"],
        data["fm_factor"],
    )
    return data


async def batch_refresh(symbols: list[str], db: AsyncSession) -> dict[str, dict[str, float]]:
    """Fetch and persist margin ratios for all given symbols."""
    results: dict[str, dict[str, float]] = {}
    for sym in symbols:
        results[sym] = await fetch_and_persist(sym, db)
    return results
