"""Decision matrix engine — compare action alternatives for each position.

For each open option position, evaluates:
1. Hold to expiry — expected P&L at current theta rate
2. Close now — lock in current P&L, free margin
3. Roll out — close current + open next month at same strike
4. Roll out & down/up — close current + open next month at further OTM strike
"""

from backend.core.greeks import calc_greeks, calc_option_price, calc_pop
from backend.models.schemas import PositionDiagnosis

MULTIPLIER = 100


def _calc_action_pnl(open_price: float, close_price: float, qty: int, direction: str) -> float:
    cost = open_price * qty * MULTIPLIER
    market = close_price * qty * MULTIPLIER
    return round(cost - market if direction == "sell" else market - cost, 2)


def build_decision_matrix(
    diag: PositionDiagnosis,
    rate: float,
    div_yield: float,
) -> list[dict]:
    """Generate action alternatives for a single option position."""
    p = diag.position
    if p.position_type != "option" or p.strike is None:
        return []

    is_call = p.option_type == "call"
    spot = diag.current_spot
    iv = diag.current_iv if diag.current_iv > 0 else 0.5
    dte = diag.dte

    actions: list[dict] = []

    # 1. Hold to expiry
    expiry_price = calc_option_price(spot, p.strike, 0, iv, rate, div_yield, is_call)
    hold_pnl = _calc_action_pnl(p.open_price, expiry_price, p.quantity, p.direction)
    actions.append(
        {
            "action": "Hold to Expiry",
            "description": f"Let expire in {dte} days",
            "expected_pnl": hold_pnl,
            "pop": diag.pop,
            "margin_freed": 0,
            "risk": "Full downside exposure remains"
            if p.direction == "sell"
            else "Time decay continues",
            "score": _score_action(hold_pnl, diag.pop, dte, diag.health.score),
        }
    )

    # 2. Close now
    close_pnl = diag.pnl.unrealized_pnl
    actions.append(
        {
            "action": "Close Now",
            "description": f"Lock {'profit' if close_pnl >= 0 else 'loss'} at ${abs(close_pnl):.0f}",
            "expected_pnl": close_pnl,
            "pop": 100.0,
            "margin_freed": round(diag.estimated_margin, 0),
            "risk": "No further risk",
            "score": _score_close(close_pnl, diag.pnl.cost_value, dte, diag.health.score),
        }
    )

    # 3. Roll out (same strike, +30 days)
    if dte > 0 and p.direction == "sell":
        roll_dte = dte + 30
        new_price = calc_option_price(spot, p.strike, roll_dte, iv, rate, div_yield, is_call)
        current_price = diag.pnl.current_price
        # Seller rolls: buy back current (debit) + sell new (credit)
        net_credit = new_price - current_price
        roll_pnl = _calc_action_pnl(p.open_price, current_price, p.quantity, p.direction)
        roll_pnl += round(net_credit * p.quantity * MULTIPLIER, 2)

        new_greeks = calc_greeks(spot, p.strike, roll_dte, iv, rate, div_yield, is_call)
        new_pop = calc_pop(new_greeks.delta)

        actions.append(
            {
                "action": "Roll Out",
                "description": f"Same strike, +30 days → DTE {roll_dte}",
                "expected_pnl": round(roll_pnl, 2),
                "pop": new_pop,
                "margin_freed": 0,
                "net_credit": round(net_credit, 4),
                "risk": "Extended exposure but more theta",
                "score": _score_roll(roll_pnl, new_pop, net_credit),
            }
        )

    # 4. Roll out & adjust strike (down for puts, up for calls)
    if dte > 0 and p.direction == "sell":
        adjustment = -5 if not is_call else 5  # move $5 further OTM
        new_strike = p.strike + adjustment
        if new_strike > 0:
            roll_dte = dte + 30
            new_price = calc_option_price(spot, new_strike, roll_dte, iv, rate, div_yield, is_call)
            current_price = diag.pnl.current_price
            net_credit = new_price - current_price

            new_greeks = calc_greeks(spot, new_strike, roll_dte, iv, rate, div_yield, is_call)
            new_pop = calc_pop(new_greeks.delta)

            direction_word = "Down" if not is_call else "Up"
            actions.append(
                {
                    "action": f"Roll Out & {direction_word}",
                    "description": f"Strike ${new_strike}, +30 days → DTE {roll_dte}",
                    "expected_pnl": round(
                        _calc_action_pnl(p.open_price, current_price, p.quantity, p.direction)
                        + net_credit * p.quantity * MULTIPLIER,
                        2,
                    ),
                    "pop": new_pop,
                    "margin_freed": 0,
                    "net_credit": round(net_credit, 4),
                    "new_strike": new_strike,
                    "risk": f"Lower premium but higher POP ({new_pop:.0f}%)",
                    "score": _score_roll(
                        _calc_action_pnl(p.open_price, current_price, p.quantity, p.direction)
                        + net_credit * p.quantity * MULTIPLIER,
                        new_pop,
                        net_credit,
                    ),
                }
            )

    actions.sort(key=lambda a: a["score"], reverse=True)
    return actions


def _score_action(pnl: float, pop: float, dte: int, health: int) -> int:
    """Score hold-to-expiry: higher for profitable, high POP, healthy positions."""
    score = 50
    if pnl > 0:
        score += 15
    elif pnl < -100:
        score -= 20
    score += int(pop * 0.3)
    if health >= 70:
        score += 10
    elif health < 40:
        score -= 15
    if dte <= 7:
        score -= 10
    return max(0, min(100, score))


def _score_close(pnl: float, cost: float, dte: int, health: int) -> int:
    """Score closing: higher when profitable or unhealthy."""
    score = 50
    pnl_pct = (pnl / cost * 100) if cost > 0 else 0
    if pnl_pct >= 50:
        score += 30
    elif pnl_pct >= 0:
        score += 10
    elif pnl_pct >= -50:
        score -= 5
    else:
        score -= 15
    if health < 40:
        score += 15
    if dte <= 7 and pnl >= 0:
        score += 10
    return max(0, min(100, score))


def _score_roll(pnl: float, pop: float, net_credit: float) -> int:
    """Score rolling: higher for net credit and improved POP."""
    score = 50
    if net_credit > 0:
        score += 20
    else:
        score -= 10
    score += int(pop * 0.2)
    if pnl > 0:
        score += 10
    return max(0, min(100, score))
