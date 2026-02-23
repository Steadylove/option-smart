"""Telegram bot service — push alerts, daily reports, and handle commands."""

import logging

import httpx

from backend.config import settings
from backend.core.alert_engine import Alert, AlertLevel

logger = logging.getLogger(__name__)

_TELEGRAM_API = "https://api.telegram.org"

_LEVEL_EMOJI = {
    AlertLevel.CRITICAL: "\U0001f534",  # red circle
    AlertLevel.WARNING: "\U0001f7e1",  # yellow circle
    AlertLevel.INFO: "\U0001f7e2",  # green circle
}


def _bot_url(method: str) -> str:
    return f"{_TELEGRAM_API}/bot{settings.telegram_bot_token}/{method}"


def _is_configured() -> bool:
    return bool(settings.telegram_bot_token and settings.telegram_chat_id)


async def send_message(text: str, parse_mode: str = "Markdown") -> bool:
    """Send a Markdown message to the configured chat. Returns True on success."""
    if not _is_configured():
        logger.debug("Telegram not configured — skipping send")
        return False

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                _bot_url("sendMessage"),
                json={
                    "chat_id": settings.telegram_chat_id,
                    "text": text,
                    "parse_mode": parse_mode,
                    "disable_web_page_preview": True,
                },
            )
            if resp.status_code != 200:
                logger.warning("Telegram send failed: %s", resp.text)
                return False
            return True
    except Exception as e:
        logger.error("Telegram send error: %s", e)
        return False


def format_alert(alert: Alert) -> str:
    """Format a single alert as a Telegram message."""
    emoji = _LEVEL_EMOJI.get(alert.level, "\u2139\ufe0f")
    lines = [
        f"{emoji} *{alert.title}*",
        "",
        alert.message,
    ]
    if alert.suggested_action:
        lines.append(f"\n\U0001f4a1 _{alert.suggested_action}_")
    return "\n".join(lines)


async def push_alerts(alerts: list[Alert]) -> int:
    """Push multiple alerts as individual Telegram messages. Returns count sent."""
    if not alerts or not _is_configured():
        return 0

    sent = 0
    for alert in alerts:
        text = format_alert(alert)
        ok = await send_message(text)
        if ok:
            sent += 1

    logger.info("Pushed %d/%d alerts to Telegram", sent, len(alerts))
    return sent


async def push_daily_report(report_text: str) -> bool:
    """Send the daily portfolio summary report."""
    return await send_message(report_text)
