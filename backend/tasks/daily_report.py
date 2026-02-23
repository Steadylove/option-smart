"""Daily portfolio report — generates summary and pushes via Telegram."""

import logging
from datetime import datetime

from backend.core.alert_engine import evaluate_portfolio
from backend.core.position_analyzer import build_portfolio_summary
from backend.models.database import async_session
from backend.services.portfolio import load_diagnoses
from backend.services.telegram import push_daily_report

logger = logging.getLogger(__name__)


def _format_report(
    diagnoses: list,
    portfolio,
    alerts: list,
) -> str:
    """Build a Markdown daily report for Telegram."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        "\U0001f4ca *OptionSmart Daily Report*",
        f"_{now}_",
        "",
        f"\U0001f4b0 *P&L*: ${portfolio.total_unrealized_pnl:+,.2f}",
        f"\u0398 *Daily Theta*: ${portfolio.daily_theta_income:+,.2f}",
        f"\u0394 *Total Delta*: {portfolio.total_delta:+.1f}",
        f"\U0001f4c8 *Positions*: {portfolio.total_positions}",
        "",
    ]

    # Health breakdown
    hc = portfolio.health_counts
    safe = hc.get("safe", 0)
    warn = hc.get("warning", 0)
    danger = hc.get("danger", 0)
    lines.append(f"\U0001f7e2 {safe}  \U0001f7e1 {warn}  \U0001f534 {danger}")
    lines.append("")

    # Expiry near positions
    expiring = [d for d in diagnoses if 0 < d.dte <= 7 and d.position.position_type == "option"]
    if expiring:
        lines.append("*\u23f0 Expiring This Week:*")
        for d in expiring:
            p = d.position
            sym = p.symbol.replace(".US", "")
            pnl_sign = "+" if d.pnl.unrealized_pnl >= 0 else ""
            lines.append(
                f"  • {sym} ${p.strike} {(p.option_type or '').upper()} "
                f"DTE {d.dte} — {pnl_sign}${d.pnl.unrealized_pnl:.0f}"
            )
        lines.append("")

    # Active alerts summary
    if alerts:
        critical = sum(1 for a in alerts if a.level == "critical")
        warning = sum(1 for a in alerts if a.level == "warning")
        lines.append(f"*\u26a0\ufe0f Alerts*: {critical} critical, {warning} warning")
    else:
        lines.append("\u2705 No active alerts")

    return "\n".join(lines)


async def run_daily_report() -> None:
    """Scheduled task: generate and push the daily summary report."""
    try:
        async with async_session() as db:
            diagnoses = await load_diagnoses(db)

        if not diagnoses:
            logger.info("No open positions — skipping daily report")
            return

        portfolio = build_portfolio_summary(diagnoses)
        alerts = evaluate_portfolio(diagnoses)
        report = _format_report(diagnoses, portfolio, alerts)

        ok = await push_daily_report(report)
        logger.info("Daily report %s", "sent" if ok else "skipped (Telegram not configured)")

    except Exception as e:
        logger.error("Daily report failed: %s", e, exc_info=True)
