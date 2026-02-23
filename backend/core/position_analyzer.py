"""Position health diagnosis and portfolio analysis engine."""

import logging

from backend.config import settings
from backend.core.greeks import calc_greeks, calc_pop, market_dte
from backend.models.schemas import (
    ConcentrationData,
    HealthLevel,
    PnLAttribution,
    PortfolioSummary,
    PositionDiagnosis,
    PositionGreeks,
    PositionHealth,
    PositionOut,
    PositionPnL,
    TimeValueAnalysis,
)

logger = logging.getLogger(__name__)

MULTIPLIER = 100  # standard US equity option


def _moneyness(spot: float, strike: float, option_type: str) -> str:
    if option_type == "call":
        if spot > strike * 1.02:
            return "ITM"
        elif spot < strike * 0.98:
            return "OTM"
        return "ATM"
    else:
        if spot < strike * 0.98:
            return "ITM"
        elif spot > strike * 1.02:
            return "OTM"
        return "ATM"


def _health_score(
    dte: int,
    moneyness: str,
    pnl_pct: float,
    direction: str,
    delta_abs: float,
) -> PositionHealth:
    """Multi-dimensional health scoring (0-100, higher = healthier)."""
    score = 50

    # DTE factor: more time is safer for sellers
    if dte > 30:
        score += 15
    elif dte > 14:
        score += 5
    elif dte > 7:
        score -= 5
    else:
        score -= 15

    # Moneyness factor
    if direction == "sell":
        if moneyness == "OTM":
            score += 20
        elif moneyness == "ATM":
            score -= 5
        else:  # ITM — danger for seller
            score -= 25
    else:
        if moneyness == "ITM":
            score += 15
        elif moneyness == "ATM":
            score += 5
        else:
            score -= 10

    # P&L factor
    if pnl_pct >= 50:
        score += 15
    elif pnl_pct >= 0:
        score += 5
    elif pnl_pct >= -50:
        score -= 5
    elif pnl_pct >= -100:
        score -= 15
    else:
        score -= 25

    # Delta risk: high |delta| means close to being exercised
    if delta_abs < 0.2:
        score += 5
    elif delta_abs > 0.5:
        score -= 10

    score = max(0, min(100, score))

    if score >= 70:
        level = HealthLevel.safe
        zone = "OTM Safe Zone"
    elif score >= 40:
        level = HealthLevel.warning
        zone = "Near ATM — Watch"
    else:
        level = HealthLevel.danger
        zone = "ITM Danger Zone"

    return PositionHealth(level=level, score=score, zone=zone)


def _action_hint(
    direction: str,
    moneyness: str,
    dte: int,
    pnl_pct: float,
    health_level: HealthLevel,
) -> str:
    """Generate a one-line action suggestion."""
    if direction == "sell":
        if pnl_pct >= 50:
            return "Consider taking profit — 50%+ of premium captured"
        if pnl_pct >= 75:
            return "Strong take-profit signal — 75%+ premium captured"
        if health_level == HealthLevel.danger:
            if dte <= 7:
                return "URGENT: Close or roll — ITM with expiry near"
            return "Roll out & down to restore OTM status"
        if health_level == HealthLevel.warning:
            if dte <= 14:
                return "Monitor closely — prepare to roll if needed"
            return "Watch zone — set alert at strike price"
        if dte <= 7 and pnl_pct >= 0:
            return "Let expire or close for remaining profit"
        return "Hold — theta decay working in your favor"
    else:
        if pnl_pct >= 100:
            return "Consider taking profit on long position"
        if pnl_pct <= -50:
            return "Review thesis — consider cutting losses"
        return "Hold — monitor for target price"


def diagnose_stock_position(
    pos: PositionOut,
    spot_price: float,
) -> PositionDiagnosis:
    """Simplified diagnosis for stock/ETF positions."""
    cost_value = pos.open_price * pos.quantity
    market_value = spot_price * pos.quantity

    if pos.direction == "sell":
        unrealized_pnl = cost_value - market_value
    else:
        unrealized_pnl = market_value - cost_value

    pnl_pct = (unrealized_pnl / cost_value * 100) if cost_value > 0 else 0

    # Stock delta = 1 per share (long), -1 per share (short)
    sign = -1 if pos.direction == "sell" else 1
    pos_delta = sign * pos.quantity

    score = 70 if pnl_pct >= 0 else max(30, 70 + int(pnl_pct / 5))
    score = max(0, min(100, score))
    if score >= 70:
        level = HealthLevel.safe
        zone = "Holding"
    elif score >= 40:
        level = HealthLevel.warning
        zone = "Unrealized Loss"
    else:
        level = HealthLevel.danger
        zone = "Deep Loss"

    if pnl_pct >= 20:
        hint = "Consider trimming — solid gains"
    elif pnl_pct >= 0:
        hint = "Hold — position in profit"
    elif pnl_pct >= -10:
        hint = "Minor drawdown — hold if thesis intact"
    else:
        hint = "Review thesis — consider reducing exposure"

    return PositionDiagnosis(
        position=pos,
        health=PositionHealth(level=level, score=score, zone=zone),
        greeks=PositionGreeks(
            delta=round(pos_delta, 2),
            gamma=0,
            theta=0,
            vega=0,
            rho=0,
        ),
        pnl=PositionPnL(
            unrealized_pnl=round(unrealized_pnl, 2),
            unrealized_pnl_pct=round(pnl_pct, 2),
            current_price=spot_price,
            market_value=round(market_value, 2),
            cost_value=round(cost_value, 2),
        ),
        dte=0,
        current_spot=spot_price,
        current_iv=0,
        moneyness="N/A",
        assignment_prob=0,
        theta_per_day=0,
        pop=0,
        action_hint=hint,
        time_value=None,
        attribution=None,
    )


def diagnose_position(
    pos: PositionOut,
    spot_price: float,
    current_option_price: float,
    iv: float,
) -> PositionDiagnosis:
    """Full health diagnosis for a single position."""
    dte = market_dte(pos.expiry)
    is_call = pos.option_type == "call"
    underlying = pos.symbol if ".US" in pos.symbol else f"{pos.symbol}.US"
    div_yield = settings.dividend_yields.get(underlying, 0.0)

    greeks = calc_greeks(
        spot=spot_price,
        strike=pos.strike,
        dte=dte,
        iv=iv,
        rate=settings.risk_free_rate,
        q=div_yield,
        is_call=is_call,
    )

    # Flip sign for short positions (seller)
    sign = -1 if pos.direction == "sell" else 1
    pos_delta = greeks.delta * pos.quantity * MULTIPLIER * sign
    pos_gamma = greeks.gamma * pos.quantity * MULTIPLIER * sign
    pos_theta = greeks.theta * pos.quantity * MULTIPLIER * sign
    pos_vega = greeks.vega * pos.quantity * MULTIPLIER * sign
    pos_rho = greeks.rho * pos.quantity * MULTIPLIER * sign

    cost_value = pos.open_price * pos.quantity * MULTIPLIER
    market_value = current_option_price * pos.quantity * MULTIPLIER

    if pos.direction == "sell":
        unrealized_pnl = cost_value - market_value
    else:
        unrealized_pnl = market_value - cost_value

    pnl_pct = (unrealized_pnl / cost_value * 100) if cost_value > 0 else 0

    money = _moneyness(spot_price, pos.strike, pos.option_type)
    delta_abs = abs(greeks.delta)
    health = _health_score(dte, money, pnl_pct, pos.direction, delta_abs)
    pop = calc_pop(greeks.delta)
    hint = _action_hint(pos.direction, money, dte, pnl_pct, health.level)

    # Time value breakdown
    is_call = pos.option_type == "call"
    intrinsic = max(spot_price - pos.strike, 0) if is_call else max(pos.strike - spot_price, 0)
    extrinsic = max(current_option_price - intrinsic, 0)
    tv_pct = (extrinsic / current_option_price * 100) if current_option_price > 0 else 0
    total_extrinsic = extrinsic * pos.quantity * MULTIPLIER

    time_value = TimeValueAnalysis(
        intrinsic_value=round(intrinsic, 4),
        extrinsic_value=round(extrinsic, 4),
        time_value_pct=round(tv_pct, 1),
        total_extrinsic=round(total_extrinsic, 2),
        theta_7d_projected=round(pos_theta * 7, 2),
        theta_to_expiry_projected=round(pos_theta * dte, 2),
    )

    # P&L attribution — instantaneous Greek sensitivities
    spot_1pct = spot_price * 0.01
    attribution = PnLAttribution(
        delta_impact_1pct=round(pos_delta * spot_1pct, 2),
        gamma_impact_1pct=round(0.5 * pos_gamma * spot_1pct**2, 2),
        theta_daily=round(pos_theta, 2),
        vega_impact_1pct=round(pos_vega, 2),
    )

    return PositionDiagnosis(
        position=pos,
        health=health,
        greeks=PositionGreeks(
            delta=round(pos_delta, 2),
            gamma=round(pos_gamma, 4),
            theta=round(pos_theta, 2),
            vega=round(pos_vega, 2),
            rho=round(pos_rho, 4),
        ),
        pnl=PositionPnL(
            unrealized_pnl=round(unrealized_pnl, 2),
            unrealized_pnl_pct=round(pnl_pct, 2),
            current_price=current_option_price,
            market_value=round(market_value, 2),
            cost_value=round(cost_value, 2),
        ),
        dte=dte,
        current_spot=spot_price,
        current_iv=iv,
        moneyness=money,
        assignment_prob=round(delta_abs * 100, 1),
        theta_per_day=round(pos_theta, 2),
        pop=pop,
        action_hint=hint,
        time_value=time_value,
        attribution=attribution,
    )


def build_portfolio_summary(
    diagnoses: list[PositionDiagnosis],
) -> PortfolioSummary:
    """Aggregate position-level data into portfolio metrics."""
    total_delta = sum(d.greeks.delta for d in diagnoses)
    total_gamma = sum(d.greeks.gamma for d in diagnoses)
    total_theta = sum(d.greeks.theta for d in diagnoses)
    total_vega = sum(d.greeks.vega for d in diagnoses)
    total_pnl = sum(d.pnl.unrealized_pnl for d in diagnoses)

    by_status: dict[str, int] = {}
    by_symbol: dict[str, int] = {}
    by_strategy: dict[str, int] = {}
    health_counts: dict[str, int] = {"safe": 0, "warning": 0, "danger": 0}

    # Concentration tracking
    cost_by_symbol: dict[str, float] = {}
    by_direction: dict[str, int] = {}
    by_expiry_week: dict[str, int] = {}
    total_extrinsic = 0.0

    for d in diagnoses:
        p = d.position
        by_status[p.status] = by_status.get(p.status, 0) + 1
        sym = p.symbol.replace(".US", "")
        by_symbol[sym] = by_symbol.get(sym, 0) + 1
        by_strategy[p.strategy] = by_strategy.get(p.strategy, 0) + 1
        health_counts[d.health.level.value] = health_counts.get(d.health.level.value, 0) + 1

        cost_by_symbol[sym] = cost_by_symbol.get(sym, 0) + d.pnl.cost_value
        by_direction[p.direction] = by_direction.get(p.direction, 0) + 1

        if p.expiry:
            iso_week = p.expiry.isocalendar()
            week_key = f"{iso_week[0]}-W{iso_week[1]:02d}"
            by_expiry_week[week_key] = by_expiry_week.get(week_key, 0) + 1

        if d.time_value:
            total_extrinsic += d.time_value.total_extrinsic

    # Convert cost to percentage weights
    total_cost = sum(cost_by_symbol.values()) or 1
    symbol_pct = {s: round(v / total_cost * 100, 1) for s, v in cost_by_symbol.items()}

    return PortfolioSummary(
        total_positions=len(diagnoses),
        total_delta=round(total_delta, 2),
        total_gamma=round(total_gamma, 4),
        total_theta=round(total_theta, 2),
        total_vega=round(total_vega, 2),
        total_unrealized_pnl=round(total_pnl, 2),
        daily_theta_income=round(total_theta, 2),
        positions_by_status=by_status,
        positions_by_symbol=by_symbol,
        positions_by_strategy=by_strategy,
        health_counts=health_counts,
        concentration=ConcentrationData(
            by_symbol=symbol_pct,
            by_direction=by_direction,
            by_expiry_week=by_expiry_week,
        ),
        total_extrinsic_value=round(total_extrinsic, 2),
    )
