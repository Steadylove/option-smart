"""Scheduled tasks for syncing market events and news from Finnhub.

News is synced incrementally — only yesterday's new articles are fetched daily.
On first run (empty DB), the last 7 days are backfilled.
"""

import asyncio
import logging
from datetime import date, datetime, timedelta

from sqlalchemy import func, select

from backend.models.database import async_session
from backend.models.market_event import MarketEvent, MarketNews
from backend.services.finnhub import (
    get_company_news,
    get_earnings_calendar,
    get_underlying_symbols,
)

logger = logging.getLogger(__name__)

# Aliases for matching (Finnhub uses GOOGL, we configure GOOG)
_ALIASES = {"GOOG": "GOOGL"}


def run_sync_earnings():
    asyncio.get_event_loop().run_until_complete(_sync_earnings())


def run_sync_news():
    asyncio.get_event_loop().run_until_complete(sync_news())


async def sync_news():
    """Public entry point — called by scheduler and bootstrap."""
    await _sync_news()


async def _sync_earnings():
    """Sync earnings calendar for tracked underlyings."""
    today = date.today()
    end = today + timedelta(days=90)
    raw_underlyings = set(get_underlying_symbols())
    underlyings = raw_underlyings | {_ALIASES.get(s, s) for s in raw_underlyings}

    try:
        earnings = await get_earnings_calendar(today, end)
    except Exception:
        logger.exception("Failed to fetch earnings calendar")
        return

    count = 0
    async with async_session() as session:
        for e in earnings:
            sym = e.get("symbol", "")
            if sym not in underlyings:
                continue

            event_date = e.get("date", "")
            source_id = f"earnings:{sym}:{event_date}"

            existing = await session.execute(
                select(MarketEvent).where(MarketEvent.source_id == source_id)
            )
            if existing.scalar_one_or_none():
                continue

            session.add(
                MarketEvent(
                    event_type="earnings",
                    symbol=sym,
                    title=f"{sym} Earnings",
                    description=_format_earnings(e),
                    event_date=event_date,
                    impact_level="high",
                    actual_value=str(e["epsActual"]) if e.get("epsActual") else None,
                    forecast_value=str(e["epsEstimate"]) if e.get("epsEstimate") else None,
                    previous_value=None,
                    source_id=source_id,
                )
            )
            count += 1

        if count:
            await session.commit()
    logger.info("Synced %d earnings events", count)


def _format_earnings(e: dict) -> str:
    parts = []
    if e.get("epsEstimate"):
        parts.append(f"EPS Est: {e['epsEstimate']}")
    if e.get("revenueEstimate"):
        rev = e["revenueEstimate"]
        if isinstance(rev, (int, float)) and rev > 1e9:
            parts.append(f"Rev Est: ${rev / 1e9:.1f}B")
    if e.get("hour"):
        parts.append("BMO" if e["hour"] == "bmo" else "AMC")
    return " | ".join(parts) or "Earnings release"


async def _sync_news():
    """Incrementally sync news. Fetches only what's missing."""
    underlyings = get_underlying_symbols()
    count = 0

    async with async_session() as session:
        # Determine sync window: if DB empty → last 7 days, else → yesterday only
        row = await session.execute(select(func.count()).select_from(MarketNews))
        existing_count = row.scalar() or 0
        if existing_count == 0:
            from_date = date.today() - timedelta(days=7)
            logger.info("First news sync — backfilling last 7 days")
        else:
            from_date = date.today() - timedelta(days=1)

        to_date = date.today()

        for sym in underlyings:
            try:
                news_items = await get_company_news(sym, from_date, to_date)
            except Exception:
                logger.exception("Failed to fetch news for %s", sym)
                continue

            for n in news_items[:20]:
                finnhub_id = n.get("id")
                if not finnhub_id:
                    continue

                existing = await session.execute(
                    select(MarketNews).where(MarketNews.finnhub_id == finnhub_id)
                )
                if existing.scalar_one_or_none():
                    continue

                published_at = (
                    datetime.fromtimestamp(n["datetime"]).isoformat() if n.get("datetime") else ""
                )

                session.add(
                    MarketNews(
                        source=n.get("source", ""),
                        symbol=sym,
                        headline=n.get("headline", ""),
                        summary=n.get("summary", ""),
                        url=n.get("url", ""),
                        published_at=published_at,
                        finnhub_id=finnhub_id,
                        sentiment=n.get("sentiment"),
                    )
                )
                count += 1

        if count:
            await session.commit()
    logger.info("Synced %d news items (from %s)", count, from_date)
