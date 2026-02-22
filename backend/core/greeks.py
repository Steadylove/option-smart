"""Black-Scholes Greeks calculator for US equity options."""

import math
from dataclasses import dataclass

from scipy.stats import norm


@dataclass
class GreeksResult:
    delta: float
    gamma: float
    theta: float  # per calendar day
    vega: float  # per 1% IV move
    rho: float


def calc_greeks(
    spot: float,
    strike: float,
    dte: int,
    iv: float,
    rate: float = 0.05,
    is_call: bool = True,
) -> GreeksResult:
    """Compute BS greeks for a single option contract.

    Args:
        spot: underlying price
        strike: strike price
        dte: days to expiration
        iv: implied volatility as decimal (e.g. 0.50 for 50%)
        rate: risk-free rate as decimal
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
    d1 = (math.log(spot / strike) + (rate + 0.5 * iv**2) * t) / (iv * sqrt_t)
    d2 = d1 - iv * sqrt_t

    nd1 = norm.cdf(d1)
    nd2 = norm.cdf(d2)
    pdf_d1 = norm.pdf(d1)
    discount = math.exp(-rate * t)

    # Gamma and Vega are the same for calls and puts
    gamma = pdf_d1 / (spot * iv * sqrt_t)
    vega = spot * pdf_d1 * sqrt_t / 100  # per 1% IV move

    if is_call:
        delta = nd1
        theta = (-spot * pdf_d1 * iv / (2 * sqrt_t) - rate * strike * discount * nd2) / 365
        rho = strike * t * discount * nd2 / 100
    else:
        delta = nd1 - 1
        theta = (
            -spot * pdf_d1 * iv / (2 * sqrt_t) + rate * strike * discount * norm.cdf(-d2)
        ) / 365
        rho = -strike * t * discount * norm.cdf(-d2) / 100

    return GreeksResult(
        delta=round(delta, 4),
        gamma=round(gamma, 4),
        theta=round(theta, 4),
        vega=round(vega, 4),
        rho=round(rho, 4),
    )


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


def calc_pop(delta: float) -> float:
    """Probability of profit for a short option (seller perspective)."""
    return round((1 - abs(delta)) * 100, 1)


def calc_annualized_return(premium: float, margin: float, dte: int) -> float:
    """Annualized return on capital for a short option position."""
    if margin <= 0 or dte <= 0:
        return 0.0
    return round(premium / margin * 365 / dte * 100, 2)
