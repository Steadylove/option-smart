"""Alert rule engine — evaluates positions against configurable thresholds."""

import logging
from datetime import datetime

from backend.models.schemas import PositionDiagnosis

logger = logging.getLogger(__name__)

# Threshold defaults (can be overridden via AlertConfig)
TAKE_PROFIT_TIERS = [50.0, 75.0]  # premium captured %
STOP_LOSS_MULTIPLIER = 2.0  # loss vs premium received
DELTA_DANGER = 0.5  # |delta| indicating high assignment risk
DTE_WARN = 7  # days to expiry threshold


class AlertLevel:
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlertType:
    TAKE_PROFIT = "take_profit"
    STOP_LOSS = "stop_loss"
    ASSIGNMENT_RISK = "assignment_risk"
    EXPIRY_NEAR = "expiry_near"
    HEALTH_DEGRADED = "health_degraded"


class Alert:
    """Structured alert produced by the engine."""

    __slots__ = (
        "created_at",
        "label",
        "level",
        "message",
        "position_id",
        "suggested_action",
        "symbol",
        "title",
        "type",
    )

    def __init__(
        self,
        *,
        alert_type: str,
        level: str,
        position_id: int,
        symbol: str,
        label: str,
        title: str,
        message: str,
        suggested_action: str = "",
    ):
        self.type = alert_type
        self.level = level
        self.position_id = position_id
        self.symbol = symbol
        self.label = label
        self.title = title
        self.message = message
        self.suggested_action = suggested_action
        self.created_at = datetime.now().isoformat()

    def to_dict(self) -> dict:
        return {
            "type": self.type,
            "level": self.level,
            "position_id": self.position_id,
            "symbol": self.symbol,
            "label": self.label,
            "title": self.title,
            "message": self.message,
            "suggested_action": self.suggested_action,
            "created_at": self.created_at,
        }


def _build_label(diag: PositionDiagnosis) -> str:
    p = diag.position
    sym = p.symbol.replace(".US", "")
    if p.position_type == "option":
        return f"{sym} ${p.strike} {(p.option_type or '').upper()}"
    return sym


def evaluate_position(diag: PositionDiagnosis) -> list[Alert]:
    """Run all alert rules against a single position diagnosis."""
    alerts: list[Alert] = []
    p = diag.position
    label = _build_label(diag)

    # Only evaluate option sellers — stock positions skip most rules
    if p.position_type != "option":
        return alerts

    is_seller = p.direction == "sell"
    pnl_pct = diag.pnl.unrealized_pnl_pct

    # ── Take profit (sellers) ───────────────────────────
    if is_seller and pnl_pct >= TAKE_PROFIT_TIERS[1]:
        alerts.append(
            Alert(
                alert_type=AlertType.TAKE_PROFIT,
                level=AlertLevel.WARNING,
                position_id=p.id,
                symbol=p.symbol,
                label=label,
                title=f"Take Profit 75% — {label}",
                message=f"Premium captured {pnl_pct:.0f}%. Close to lock in profit.",
                suggested_action="Close position to lock profit and free margin",
            )
        )
    elif is_seller and pnl_pct >= TAKE_PROFIT_TIERS[0]:
        alerts.append(
            Alert(
                alert_type=AlertType.TAKE_PROFIT,
                level=AlertLevel.INFO,
                position_id=p.id,
                symbol=p.symbol,
                label=label,
                title=f"Take Profit 50% — {label}",
                message=f"Premium captured {pnl_pct:.0f}%. Consider closing.",
                suggested_action="Consider closing to redeploy capital",
            )
        )

    # ── Stop loss (sellers) ─────────────────────────────
    if is_seller and pnl_pct <= -(STOP_LOSS_MULTIPLIER * 100):
        alerts.append(
            Alert(
                alert_type=AlertType.STOP_LOSS,
                level=AlertLevel.CRITICAL,
                position_id=p.id,
                symbol=p.symbol,
                label=label,
                title=f"Stop Loss — {label}",
                message=f"Loss {pnl_pct:.0f}% exceeds 2x premium threshold.",
                suggested_action="Close or roll to limit further damage",
            )
        )

    # ── Assignment risk ─────────────────────────────────
    delta_abs = abs(diag.greeks.delta) / (p.quantity * 100) if p.quantity else 0
    if is_seller and delta_abs > DELTA_DANGER:
        alerts.append(
            Alert(
                alert_type=AlertType.ASSIGNMENT_RISK,
                level=AlertLevel.CRITICAL,
                position_id=p.id,
                symbol=p.symbol,
                label=label,
                title=f"Assignment Risk — {label}",
                message=f"|Delta| = {delta_abs:.2f}, assignment probability ~{diag.assignment_prob:.0f}%.",
                suggested_action="Roll out & down to restore OTM status",
            )
        )

    # ── Expiry near ─────────────────────────────────────
    if diag.dte <= DTE_WARN and diag.dte > 0:
        alerts.append(
            Alert(
                alert_type=AlertType.EXPIRY_NEAR,
                level=AlertLevel.WARNING,
                position_id=p.id,
                symbol=p.symbol,
                label=label,
                title=f"Expiry in {diag.dte}d — {label}",
                message=f"DTE {diag.dte}. Gamma risk is elevated.",
                suggested_action="Close, let expire, or roll to next cycle",
            )
        )

    # ── Health degraded ─────────────────────────────────
    if diag.health.level.value == "danger":
        alerts.append(
            Alert(
                alert_type=AlertType.HEALTH_DEGRADED,
                level=AlertLevel.CRITICAL,
                position_id=p.id,
                symbol=p.symbol,
                label=label,
                title=f"Danger Zone — {label}",
                message=f"Health score {diag.health.score}/100. {diag.health.zone}.",
                suggested_action=diag.action_hint,
            )
        )

    return alerts


def evaluate_portfolio(diagnoses: list[PositionDiagnosis]) -> list[Alert]:
    """Scan entire portfolio and collect alerts, deduplicated per position."""
    all_alerts: list[Alert] = []
    for diag in diagnoses:
        all_alerts.extend(evaluate_position(diag))

    # Sort: critical first, then warning, then info
    priority = {AlertLevel.CRITICAL: 0, AlertLevel.WARNING: 1, AlertLevel.INFO: 2}
    all_alerts.sort(key=lambda a: priority.get(a.level, 9))

    logger.info("Alert scan complete: %d alerts from %d positions", len(all_alerts), len(diagnoses))
    return all_alerts
