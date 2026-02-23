"""Finnhub API client with TTL caching and rate control."""

import logging
import time
from datetime import date, datetime, timedelta

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)

_BASE_URL = "https://finnhub.io/api/v1"
_CACHE: dict[str, tuple[float, object]] = {}
_NEWS_TTL = 600  # 10 minutes
_CALENDAR_TTL = 3600  # 1 hour


def _cache_get(key: str, ttl: int) -> object | None:
    if key in _CACHE:
        ts, val = _CACHE[key]
        if time.time() - ts < ttl:
            return val
    return None


def _cache_set(key: str, val: object) -> None:
    _CACHE[key] = (time.time(), val)


async def _request(endpoint: str, params: dict | None = None) -> dict | list | None:
    if not settings.finnhub_api_key:
        logger.warning("Finnhub API key not configured")
        return None

    p = {"token": settings.finnhub_api_key, **(params or {})}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f"{_BASE_URL}{endpoint}", params=p)
            if resp.status_code == 429:
                logger.warning("Finnhub rate limited")
                return None
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as e:
        logger.error("Finnhub request failed: %s", e)
        return None


async def get_company_news(
    symbol: str,
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[dict]:
    to_date = to_date or date.today()
    from_date = from_date or to_date - timedelta(days=7)
    key = f"company_news:{symbol}:{from_date}:{to_date}"

    cached = _cache_get(key, _NEWS_TTL)
    if cached is not None:
        return cached

    data = await _request(
        "/company-news",
        {"symbol": symbol, "from": str(from_date), "to": str(to_date)},
    )
    result = data if isinstance(data, list) else []
    _cache_set(key, result)
    return result


async def get_market_news(category: str = "general") -> list[dict]:
    key = f"market_news:{category}"
    cached = _cache_get(key, _NEWS_TTL)
    if cached is not None:
        return cached

    data = await _request("/news", {"category": category})
    result = data if isinstance(data, list) else []
    _cache_set(key, result)
    return result


async def get_earnings_calendar(
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[dict]:
    from_date = from_date or date.today()
    to_date = to_date or from_date + timedelta(days=30)
    key = f"earnings:{from_date}:{to_date}"

    cached = _cache_get(key, _CALENDAR_TTL)
    if cached is not None:
        return cached

    data = await _request(
        "/calendar/earnings",
        {"from": str(from_date), "to": str(to_date)},
    )
    result = []
    if isinstance(data, dict):
        result = data.get("earningsCalendar", [])
    _cache_set(key, result)
    return result


async def get_economic_calendar(
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[dict]:
    from_date = from_date or date.today()
    to_date = to_date or from_date + timedelta(days=30)
    key = f"economic:{from_date}:{to_date}"

    cached = _cache_get(key, _CALENDAR_TTL)
    if cached is not None:
        return cached

    data = await _request(
        "/calendar/economic",
        {"from": str(from_date), "to": str(to_date)},
    )
    result = []
    if isinstance(data, dict):
        result = data.get("economicCalendar", [])
    _cache_set(key, result)
    return result


async def get_stock_candles(
    symbol: str,
    resolution: str = "D",
    from_date: date | None = None,
    to_date: date | None = None,
) -> dict | None:
    """Fetch OHLCV candle data. Resolution: 1/5/15/30/60/D/W/M."""
    to_date = to_date or date.today()
    from_date = from_date or to_date - timedelta(days=30)

    from_ts = int(datetime.combine(from_date, datetime.min.time()).timestamp())
    to_ts = int(datetime.combine(to_date, datetime.max.time()).timestamp())

    key = f"candles:{symbol}:{resolution}:{from_date}:{to_date}"
    cached = _cache_get(key, _NEWS_TTL)
    if cached is not None:
        return cached

    data = await _request(
        "/stock/candle",
        {"symbol": symbol, "resolution": resolution, "from": from_ts, "to": to_ts},
    )
    if isinstance(data, dict) and data.get("s") == "ok":
        _cache_set(key, data)
        return data
    return None


def get_underlying_symbols() -> list[str]:
    """Return deduplicated list of all underlying symbols we track."""
    seen = set()
    result = []
    for underlyings in settings.symbol_underlying_map.values():
        for sym in underlyings:
            if sym not in seen:
                seen.add(sym)
                result.append(sym)
    return result


def resolve_underlyings(symbol: str) -> list[str]:
    """Map a watched symbol to its underlying tickers for news lookup."""
    clean = symbol.replace(".US", "")
    return settings.symbol_underlying_map.get(symbol, [clean])
