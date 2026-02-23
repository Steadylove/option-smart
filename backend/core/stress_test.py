"""Stress testing engine — reprice positions under hypothetical scenarios."""

from backend.core.greeks import calc_greeks, calc_option_price
from backend.models.schemas import (
    PositionDiagnosis,
    StressPositionResult,
    StressScenario,
    StressScenarioResult,
)

MULTIPLIER = 100

PRICE_SCENARIOS = [
    StressScenario(name="Spot -20%", price_change_pct=-20),
    StressScenario(name="Spot -10%", price_change_pct=-10),
    StressScenario(name="Spot -5%", price_change_pct=-5),
    StressScenario(name="Spot -3%", price_change_pct=-3),
    StressScenario(name="Current", price_change_pct=0),
    StressScenario(name="Spot +3%", price_change_pct=3),
    StressScenario(name="Spot +5%", price_change_pct=5),
    StressScenario(name="Spot +10%", price_change_pct=10),
    StressScenario(name="Spot +20%", price_change_pct=20),
]

IV_SCENARIOS = [
    StressScenario(name="IV -30%", iv_change_pct=-30),
    StressScenario(name="Current IV", iv_change_pct=0),
    StressScenario(name="IV +30%", iv_change_pct=30),
    StressScenario(name="IV +50%", iv_change_pct=50),
    StressScenario(name="IV +100%", iv_change_pct=100),
]

TIME_SCENARIOS = [
    StressScenario(name="Today", days_forward=0),
    StressScenario(name="T+7", days_forward=7),
    StressScenario(name="T+14", days_forward=14),
    StressScenario(name="T+30", days_forward=30),
]

COMPOSITE_SCENARIOS = [
    StressScenario(name="Bear + High Vol", price_change_pct=-10, iv_change_pct=50),
    StressScenario(name="Crash", price_change_pct=-20, iv_change_pct=100),
    StressScenario(name="Bull + Vol Crush", price_change_pct=5, iv_change_pct=-30),
    StressScenario(name="Nightmare (Put)", price_change_pct=-20, iv_change_pct=100),
    StressScenario(name="Nightmare (Call)", price_change_pct=20, iv_change_pct=50),
]

SCENARIO_PRESETS: dict[str, list[StressScenario]] = {
    "price": PRICE_SCENARIOS,
    "iv": IV_SCENARIOS,
    "time": TIME_SCENARIOS,
    "composite": COMPOSITE_SCENARIOS,
}


def _position_label(diag: PositionDiagnosis) -> str:
    p = diag.position
    sym = p.symbol.replace(".US", "")
    if p.position_type == "option" and p.strike is not None:
        return f"{sym} ${p.strike} {(p.option_type or '').upper()}"
    return sym


def _stress_stock(
    diag: PositionDiagnosis,
    scenario: StressScenario,
) -> StressPositionResult:
    """Price-only stress for stock/ETF positions."""
    p = diag.position
    new_spot = diag.current_spot * (1 + scenario.price_change_pct / 100)
    if p.direction == "sell":
        scenario_pnl = (p.open_price - new_spot) * p.quantity
    else:
        scenario_pnl = (new_spot - p.open_price) * p.quantity

    return StressPositionResult(
        position_id=p.id,
        symbol=p.symbol,
        label=_position_label(diag),
        current_pnl=diag.pnl.unrealized_pnl,
        scenario_pnl=round(scenario_pnl, 2),
        pnl_change=round(scenario_pnl - diag.pnl.unrealized_pnl, 2),
        scenario_price=round(new_spot, 2),
        scenario_delta=diag.greeks.delta,
    )


def _stress_option(
    diag: PositionDiagnosis,
    scenario: StressScenario,
    rate: float,
    div_yields: dict[str, float],
) -> StressPositionResult:
    """Full BSM repricing for option positions under scenario conditions."""
    p = diag.position
    new_spot = diag.current_spot * (1 + scenario.price_change_pct / 100)
    base_iv = diag.current_iv if diag.current_iv > 0 else 0.5
    new_iv = base_iv * (1 + scenario.iv_change_pct / 100)
    new_iv = max(new_iv, 0.01)
    new_dte = max(diag.dte - scenario.days_forward, 0)

    is_call = p.option_type == "call"
    underlying = p.symbol if ".US" in p.symbol else f"{p.symbol}.US"
    q = div_yields.get(underlying, 0.0)

    new_price = calc_option_price(new_spot, p.strike, new_dte, new_iv, rate, q, is_call)

    new_delta = 0.0
    if new_dte > 0 and new_iv > 0:
        g = calc_greeks(new_spot, p.strike, new_dte, new_iv, rate, q, is_call)
        new_delta = g.delta

    cost_value = p.open_price * p.quantity * MULTIPLIER
    market_value = new_price * p.quantity * MULTIPLIER
    scenario_pnl = cost_value - market_value if p.direction == "sell" else market_value - cost_value

    sign = -1 if p.direction == "sell" else 1

    return StressPositionResult(
        position_id=p.id,
        symbol=p.symbol,
        label=_position_label(diag),
        current_pnl=diag.pnl.unrealized_pnl,
        scenario_pnl=round(scenario_pnl, 2),
        pnl_change=round(scenario_pnl - diag.pnl.unrealized_pnl, 2),
        scenario_price=round(new_price, 4),
        scenario_delta=round(new_delta * p.quantity * MULTIPLIER * sign, 2),
    )


def run_stress_scenarios(
    diagnoses: list[PositionDiagnosis],
    scenarios: list[StressScenario],
    rate: float,
    div_yields: dict[str, float],
) -> list[StressScenarioResult]:
    """Run all scenarios against all positions, return matrix of results."""
    current_pnl = sum(d.pnl.unrealized_pnl for d in diagnoses)
    results: list[StressScenarioResult] = []

    for scenario in scenarios:
        pos_results: list[StressPositionResult] = []

        for diag in diagnoses:
            if diag.position.position_type == "option" and diag.position.strike is not None:
                r = _stress_option(diag, scenario, rate, div_yields)
            else:
                r = _stress_stock(diag, scenario)
            pos_results.append(r)

        portfolio_pnl = sum(r.scenario_pnl for r in pos_results)
        results.append(
            StressScenarioResult(
                scenario=scenario,
                portfolio_pnl=round(portfolio_pnl, 2),
                portfolio_pnl_change=round(portfolio_pnl - current_pnl, 2),
                positions=pos_results,
            )
        )

    return results
