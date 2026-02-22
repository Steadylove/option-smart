"""Longbridge OpenAPI integration for quote, option, and trade data.

All external API calls are wrapped with TTL caching and throttling to
stay well within Longbridge rate limits.
"""

import logging
import time
from datetime import date
from functools import wraps
from threading import Lock

from longport.openapi import Config, QuoteContext, TradeContext

from backend.config import settings

logger = logging.getLogger(__name__)

_quote_ctx: QuoteContext | None = None
_trade_ctx: TradeContext | None = None

# ── TTL cache ──────────────────────────────────────────────

_cache: dict[str, tuple[float, object]] = {}
_cache_lock = Lock()
_cache_stats: dict[str, int] = {"hit": 0, "miss": 0}


def _cached(ttl_seconds: int):
    """Thread-safe TTL cache decorator. Cache key is derived from fn name + args."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            key = f"{fn.__name__}:{args}:{kwargs}"
            now = time.monotonic()

            with _cache_lock:
                if key in _cache:
                    expires_at, value = _cache[key]
                    if now < expires_at:
                        _cache_stats["hit"] += 1
                        return value

            _cache_stats["miss"] += 1
            logger.debug("Cache MISS: %s (ttl=%ds)", fn.__name__, ttl_seconds)
            result = fn(*args, **kwargs)

            with _cache_lock:
                _cache[key] = (now + ttl_seconds, result)

            return result

        return wrapper

    return decorator


def clear_cache():
    """Clear all cached data (useful after sync or manual refresh)."""
    with _cache_lock:
        _cache.clear()
    logger.info("Cache cleared")


def get_cache_stats() -> dict:
    return {**_cache_stats, "entries": len(_cache)}


# ── Global throttle for option_quote (heaviest endpoint) ───

_throttle_lock = Lock()
_last_option_quote_time: float = 0
_MIN_OPTION_QUOTE_GAP = 5.0


def _throttled_option_quote(symbols: list[str]) -> list:
    """Call ctx.option_quote with global throttle + auto-retry."""
    global _last_option_quote_time
    ctx = get_quote_ctx()

    max_retries = 3
    for attempt in range(max_retries):
        with _throttle_lock:
            now = time.monotonic()
            wait = _MIN_OPTION_QUOTE_GAP - (now - _last_option_quote_time)
            if wait > 0:
                logger.debug("Throttle: waiting %.1fs before option_quote", wait)
                time.sleep(wait)
            _last_option_quote_time = time.monotonic()

        try:
            return ctx.option_quote(symbols)
        except Exception as e:
            err_str = str(e)
            if "301607" in err_str or "Too many" in err_str:
                backoff = _MIN_OPTION_QUOTE_GAP * (attempt + 1)
                logger.warning(
                    "Rate limited (attempt %d/%d), backing off %.0fs",
                    attempt + 1,
                    max_retries,
                    backoff,
                )
                time.sleep(backoff)
                continue
            raise

    return ctx.option_quote(symbols)


# ── Quote context ──────────────────────────────────────────


def get_quote_ctx() -> QuoteContext:
    """Lazy-init singleton QuoteContext."""
    global _quote_ctx
    if _quote_ctx is None:
        config = Config(
            app_key=settings.longport_app_key,
            app_secret=settings.longport_app_secret,
            access_token=settings.longport_access_token,
        )
        _quote_ctx = QuoteContext(config)
        logger.info("Longbridge QuoteContext initialized")
    return _quote_ctx


# ── Trade context ─────────────────────────────────────────


def get_trade_ctx() -> TradeContext:
    """Lazy-init singleton TradeContext for account/trade operations."""
    global _trade_ctx
    if _trade_ctx is None:
        config = Config(
            app_key=settings.longport_app_key,
            app_secret=settings.longport_app_secret,
            access_token=settings.longport_access_token,
        )
        _trade_ctx = TradeContext(config)
        logger.info("Longbridge TradeContext initialized")
    return _trade_ctx


# ── Account positions (rarely change, cache long) ────────


@_cached(ttl_seconds=120)
def get_account_positions() -> list[dict]:
    """Fetch all positions (stocks + options) from brokerage account."""
    ctx = get_trade_ctx()
    resp = ctx.stock_positions()

    positions = []
    for channel in resp.channels:
        for info in channel.positions:
            positions.append(
                {
                    "symbol": info.symbol,
                    "symbol_name": info.symbol_name,
                    "quantity": int(info.quantity),
                    "available_quantity": int(info.available_quantity)
                    if info.available_quantity
                    else 0,
                    "cost_price": str(info.cost_price) if info.cost_price else "0",
                    "currency": getattr(info, "currency", "USD"),
                    "market": str(getattr(info, "market", "US")),
                    "init_quantity": int(info.init_quantity) if info.init_quantity else 0,
                }
            )
    return positions


# ── Stock quotes ──────────────────────────────────────────


@_cached(ttl_seconds=10)
def get_stock_quotes(symbols: tuple[str, ...]) -> list[dict]:
    """Fetch real-time quotes for stock/ETF symbols.

    Always pass a sorted tuple for consistent cache keys.
    """
    ctx = get_quote_ctx()
    raw = ctx.quote(list(symbols))
    return [
        {
            "symbol": q.symbol,
            "last_done": str(q.last_done),
            "prev_close": str(q.prev_close),
            "open": str(q.open),
            "high": str(q.high),
            "low": str(q.low),
            "volume": q.volume,
            "turnover": str(q.turnover),
            "timestamp": q.timestamp.isoformat() if q.timestamp else None,
        }
        for q in raw
    ]


# ── Option expiry dates (static within a day, cache long) ─


@_cached(ttl_seconds=3600)
def get_option_expiry_dates(symbol: str) -> list[date]:
    """Get available option expiry dates for a symbol."""
    ctx = get_quote_ctx()
    return ctx.option_chain_expiry_date_list(symbol)


# ── Option chain structure (static within a day, cache long) ─


@_cached(ttl_seconds=3600)
def get_option_chain(symbol: str, expiry: date) -> list[dict]:
    """Get option chain (call/put symbols) for a given expiry date."""
    ctx = get_quote_ctx()
    raw = ctx.option_chain_info_by_date(symbol, expiry)
    return [
        {
            "strike": str(info.price),
            "call_symbol": info.call_symbol,
            "put_symbol": info.put_symbol,
            "standard": info.standard,
        }
        for info in raw
    ]


# ── Option quotes (heavy, rate-limited, cache longer) ─────


def _resolve_direction(direction) -> str:
    """Convert OptionDirection enum to string."""
    name = getattr(direction, "__name__", str(direction))
    if "Put" in name:
        return "P"
    if "Call" in name:
        return "C"
    return str(direction)


@_cached(ttl_seconds=60)
def get_option_quotes(symbols: tuple[str, ...]) -> list[dict]:
    """Fetch real-time option quotes with IV and OI.

    Accepts a sorted tuple for cache-key hashability.
    """
    raw = _throttled_option_quote(list(symbols))
    results = []
    for q in raw:
        results.append(
            {
                "symbol": q.symbol,
                "last_done": str(q.last_done),
                "prev_close": str(q.prev_close),
                "open": str(q.open),
                "high": str(q.high),
                "low": str(q.low),
                "volume": q.volume,
                "turnover": str(q.turnover),
                "implied_volatility": str(q.implied_volatility),
                "open_interest": q.open_interest,
                "strike_price": str(q.strike_price),
                "expiry_date": str(q.expiry_date),
                "direction": _resolve_direction(q.direction),
                "contract_multiplier": str(q.contract_multiplier),
                "historical_volatility": str(q.historical_volatility),
                "underlying_symbol": q.underlying_symbol,
            }
        )
    return results
