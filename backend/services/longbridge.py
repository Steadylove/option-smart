"""Longbridge OpenAPI integration for quote, option, and trade data.

All external API calls are wrapped with TTL caching and throttling to
stay well within Longbridge rate limits.

Two-tier credential model:
  - System QuoteContext: uses .env keys for market data (no login required)
  - User TradeContext: uses per-user keys for positions/balance (login required)
"""

import contextvars
import logging
import time
from datetime import date
from decimal import Decimal
from functools import wraps
from threading import Lock

from longport.openapi import Config, OrderSide, OrderType, QuoteContext, TradeContext

from backend.config import settings
from backend.core.market_hours import is_us_market_open

logger = logging.getLogger(__name__)

# Per-request user session (for TradeContext only)
current_session: contextvars.ContextVar = contextvars.ContextVar("current_session", default=None)

# System-level QuoteContext initialized at startup with .env credentials
_system_quote_ctx: QuoteContext | None = None


def init_system_quote_ctx() -> None:
    """Initialize system-level QuoteContext from .env credentials. Called once at startup."""
    global _system_quote_ctx
    if not settings.longport_app_key:
        logger.warning("LONGPORT_APP_KEY not set — system QuoteContext unavailable")
        return
    cfg = Config(
        app_key=settings.longport_app_key,
        app_secret=settings.longport_app_secret,
        access_token=settings.longport_access_token,
    )
    _system_quote_ctx = QuoteContext(cfg)
    logger.info("System QuoteContext initialized (market data ready)")


def get_quote_ctx() -> QuoteContext:
    """Get system-level QuoteContext for market data."""
    if _system_quote_ctx is None:
        raise RuntimeError("System QuoteContext not initialized — check .env LONGPORT_* keys")
    return _system_quote_ctx


def get_trade_ctx() -> TradeContext:
    """Get TradeContext from the current user's session."""
    session = current_session.get(None)
    if session is None:
        from backend.services.session import session_manager

        session = session_manager.first_session()
        if session is None:
            raise RuntimeError("No active session — user must connect first")
    return session.trade_ctx


def _session_prefix() -> str:
    """Cache key prefix: per-user for trade data, 'system' for market data."""
    s = current_session.get(None)
    return s.token[:12] if s else "system"


# ── TTL cache ──────────────────────────────────────────────

_cache: dict[str, tuple[float, object]] = {}
_cache_lock = Lock()
_cache_stats: dict[str, int] = {"hit": 0, "miss": 0}

_OFF_HOURS_TTL = 86400  # 24h — prices don't change when market is closed


def _cached(ttl_seconds: int, *, market_aware: bool = False):
    """Thread-safe TTL cache decorator.

    When market_aware=True, uses ttl_seconds during trading hours
    and 24h outside trading hours to avoid unnecessary API calls.
    Cache keys are prefixed with the session token for per-user isolation.
    """

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            effective_ttl = ttl_seconds
            if market_aware and not is_us_market_open():
                effective_ttl = _OFF_HOURS_TTL

            prefix = _session_prefix()
            key = f"{prefix}:{fn.__name__}:{args}:{kwargs}"
            now = time.monotonic()

            with _cache_lock:
                if key in _cache:
                    expires_at, value = _cache[key]
                    if now < expires_at:
                        _cache_stats["hit"] += 1
                        return value

            _cache_stats["miss"] += 1
            logger.debug(
                "Cache MISS: %s (ttl=%ds, market_open=%s)",
                fn.__name__,
                effective_ttl,
                is_us_market_open(),
            )
            result = fn(*args, **kwargs)

            with _cache_lock:
                _cache[key] = (now + effective_ttl, result)

            return result

        return wrapper

    return decorator


def clear_cache():
    """Clear all cached data (useful after sync or manual refresh)."""
    with _cache_lock:
        _cache.clear()
    logger.info("Cache cleared")


def clear_cache_for(*fn_names: str):
    """Clear cache entries for specific functions."""
    with _cache_lock:
        keys = [k for k in _cache if any(fn in k for fn in fn_names)]
        for k in keys:
            del _cache[k]
    if keys:
        logger.info("Cleared %d cache entries for %s", len(keys), ", ".join(fn_names))


def clear_account_cache():
    """Clear only account-related cache entries (balance + max qty)."""
    with _cache_lock:
        keys_to_remove = [
            k for k in _cache if "get_account_balance:" in k or "get_max_purchase_quantity:" in k
        ]
        for k in keys_to_remove:
            del _cache[k]
    logger.info("Account cache cleared (%d entries)", len(keys_to_remove))


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


# ── Account balance ───────────────────────────────────────


@_cached(ttl_seconds=86400)
def get_account_balance() -> dict:
    """Fetch account balance: cash, buying power, margin info.
    Cached for 24h — refreshed daily by scheduler + manual refresh.
    """
    ctx = get_trade_ctx()
    resp = ctx.account_balance(currency="USD")

    result: dict = {
        "total_cash": "0",
        "net_assets": "0",
        "buy_power": "0",
        "init_margin": "0",
        "maintenance_margin": "0",
        "margin_call": "0",
        "max_finance_amount": "0",
        "remaining_finance_amount": "0",
        "risk_level": 0,
        "currency": "USD",
        "cash_infos": [],
    }
    for acct in resp:
        result["total_cash"] = str(acct.total_cash)
        result["net_assets"] = str(acct.net_assets)
        result["buy_power"] = str(acct.buy_power)
        result["init_margin"] = str(acct.init_margin)
        result["maintenance_margin"] = str(acct.maintenance_margin)
        result["margin_call"] = str(getattr(acct, "margin_call", "0"))
        result["max_finance_amount"] = str(getattr(acct, "max_finance_amount", "0"))
        result["remaining_finance_amount"] = str(getattr(acct, "remaining_finance_amount", "0"))
        result["risk_level"] = acct.risk_level
        result["currency"] = str(acct.currency)
        result["cash_infos"] = [
            {
                "currency": str(ci.currency),
                "available": str(getattr(ci, "available_cash", "0")),
                "frozen": str(getattr(ci, "frozen_cash", "0")),
                "settling": str(getattr(ci, "settling_cash", "0")),
            }
            for ci in (acct.cash_infos or [])
        ]
    return result


@_cached(ttl_seconds=86400)
def get_margin_ratio(symbol: str) -> dict:
    """Fetch margin ratio for a stock symbol. Cached 24h."""
    ctx = get_trade_ctx()
    resp = ctx.margin_ratio(symbol)
    return {
        "im_factor": float(resp.im_factor) if resp.im_factor else 0.5,
        "mm_factor": float(resp.mm_factor) if resp.mm_factor else 0.35,
        "fm_factor": float(resp.fm_factor) if resp.fm_factor else 0.3,
    }


@_cached(ttl_seconds=3600, market_aware=True)
def get_max_purchase_quantity(symbol: str, side: str, price: float | None = None) -> dict:
    """Estimate max buy/sell quantity for a symbol. Cached 1h."""
    ctx = get_trade_ctx()
    order_side = OrderSide.Sell if side.lower() == "sell" else OrderSide.Buy

    kwargs: dict = {
        "symbol": symbol,
        "order_type": OrderType.LO,
        "side": order_side,
    }
    if price is not None:
        kwargs["price"] = Decimal(str(price))

    resp = ctx.estimate_max_purchase_quantity(**kwargs)
    return {
        "cash_max_qty": int(resp.cash_max_qty),
        "margin_max_qty": int(resp.margin_max_qty),
    }


# ── Stock quotes ──────────────────────────────────────────


@_cached(ttl_seconds=10, market_aware=True)
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


@_cached(ttl_seconds=300, market_aware=True)
def get_option_quotes(symbols: tuple[str, ...]) -> list[dict]:
    """Fetch real-time option quotes with IV and OI.

    Accepts a sorted tuple for cache-key hashability.
    TTL 5min during market hours, 24h off-hours.
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
