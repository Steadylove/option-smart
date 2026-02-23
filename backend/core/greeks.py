"""Black-Scholes-Merton Greeks calculator for US equity options.

Uses the generalized BSM model with continuous dividend yield,
matching the methodology used by most broker platforms (including Longbridge).
"""

import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from scipy.stats import norm


@dataclass
class GreeksResult:
    delta: float
    gamma: float
    theta: float  # per calendar day
    vega: float  # per 1% IV move
    rho: float


def _et_zone():
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo("America/New_York")
    except ImportError:
        import pytz

        return pytz.timezone("America/New_York")


def market_dte(expiry: date) -> int:
    """Calendar days from last US market session to expiry.

    When market is closed (weekends, before 9:30 AM ET), uses the last
    trading date as reference — matching broker conventions (Longbridge).
    During market hours, uses today.
    """
    et = _et_zone()
    now = datetime.now(et)
    ref = now.date()

    is_weekday = ref.weekday() < 5
    past_open = now.hour > 9 or (now.hour == 9 and now.minute >= 30)

    if is_weekday and past_open:
        return max((expiry - ref).days, 0)

    # Market not open — roll back to last business day
    if is_weekday:
        ref -= timedelta(days=1)
    while ref.weekday() >= 5:
        ref -= timedelta(days=1)

    return max((expiry - ref).days, 0)


def calc_greeks(
    spot: float,
    strike: float,
    dte: int,
    iv: float,
    rate: float = 0.043,
    q: float = 0.0,
    is_call: bool = True,
) -> GreeksResult:
    """Compute BSM-Merton greeks for a single option contract.

    Generalized Black-Scholes-Merton with continuous dividend yield.

    Args:
        spot: underlying price
        strike: strike price
        dte: calendar days to expiration
        iv: implied volatility as decimal (e.g. 0.50 for 50%)
        rate: risk-free rate as decimal
        q: continuous dividend yield as decimal
        is_call: True for call, False for put
    """
    if dte <= 0 or iv <= 0:
        sign = 1 if is_call else -1
        intrinsic = max(sign * (spot - strike), 0)
        return GreeksResult(
            delta=float(sign) if intrinsic > 0 else 0.0,
            gamma=0.0,
            theta=0.0,
            vega=0.0,
            rho=0.0,
        )

    t = dte / 365.0
    sqrt_t = math.sqrt(t)
    eq = math.exp(-q * t)
    er = math.exp(-rate * t)

    d1 = (math.log(spot / strike) + (rate - q + 0.5 * iv**2) * t) / (iv * sqrt_t)
    d2 = d1 - iv * sqrt_t

    nd1 = norm.cdf(d1)
    pdf_d1 = norm.pdf(d1)
    nd2 = norm.cdf(d2)

    gamma = eq * pdf_d1 / (spot * iv * sqrt_t)
    vega = spot * eq * pdf_d1 * sqrt_t / 100

    if is_call:
        delta = eq * nd1
        theta = (
            -spot * eq * pdf_d1 * iv / (2 * sqrt_t) + q * spot * eq * nd1 - rate * strike * er * nd2
        ) / 365
        rho = strike * t * er * nd2 / 100
    else:
        nnd1 = norm.cdf(-d1)
        nnd2 = norm.cdf(-d2)
        delta = eq * (nd1 - 1)
        theta = (
            -spot * eq * pdf_d1 * iv / (2 * sqrt_t)
            - q * spot * eq * nnd1
            + rate * strike * er * nnd2
        ) / 365
        rho = -strike * t * er * nnd2 / 100

    return GreeksResult(
        delta=round(delta, 4),
        gamma=round(gamma, 4),
        theta=round(theta, 4),
        vega=round(vega, 4),
        rho=round(rho, 4),
    )


def calc_pop(delta: float) -> float:
    """Probability of profit for a short option (seller perspective)."""
    return round((1 - abs(delta)) * 100, 1)


def calc_annualized_return(premium: float, margin: float, dte: int) -> float:
    """Annualized return on capital for a short option position."""
    if margin <= 0 or dte <= 0:
        return 0.0
    return round(premium / margin * 365 / dte * 100, 2)


def calc_option_price(
    spot: float,
    strike: float,
    dte: int,
    iv: float,
    rate: float = 0.043,
    q: float = 0.0,
    is_call: bool = True,
) -> float:
    """BSM theoretical option price for repricing under stress scenarios."""
    if dte <= 0 or iv <= 0:
        sign = 1 if is_call else -1
        return max(sign * (spot - strike), 0)

    t = dte / 365.0
    sqrt_t = math.sqrt(t)

    d1 = (math.log(spot / strike) + (rate - q + 0.5 * iv**2) * t) / (iv * sqrt_t)
    d2 = d1 - iv * sqrt_t

    if is_call:
        price = spot * math.exp(-q * t) * norm.cdf(d1) - strike * math.exp(-rate * t) * norm.cdf(d2)
    else:
        price = strike * math.exp(-rate * t) * norm.cdf(-d2) - spot * math.exp(-q * t) * norm.cdf(
            -d1
        )

    return max(price, 0)


def calc_iv_rank(current_iv: float, iv_history: list[float]) -> float:
    """IV Rank: where current IV sits in 52-week range (0-100)."""
    if not iv_history:
        return 0.0
    iv_min = min(iv_history)
    iv_max = max(iv_history)
    if iv_max == iv_min:
        return 50.0
    return round((current_iv - iv_min) / (iv_max - iv_min) * 100, 1)


def calc_iv_percentile(current_iv: float, iv_history: list[float]) -> float:
    """IV Percentile: % of days in 52-week period with IV below current."""
    if not iv_history:
        return 0.0
    below = sum(1 for iv in iv_history if iv < current_iv)
    return round(below / len(iv_history) * 100, 1)
