"""Periodic alert scan — evaluates portfolio and pushes alerts via Telegram."""

import logging

from backend.core.alert_engine import evaluate_portfolio
from backend.models.database import async_session
from backend.services.portfolio import load_diagnoses
from backend.services.telegram import push_alerts

logger = logging.getLogger(__name__)


async def run_alert_scan() -> None:
    """Scheduled task: load positions, run alert engine, push to Telegram."""
    try:
        async with async_session() as db:
            diagnoses = await load_diagnoses(db)

        if not diagnoses:
            logger.debug("No open positions — skipping alert scan")
            return

        alerts = evaluate_portfolio(diagnoses)
        if alerts:
            sent = await push_alerts(alerts)
            logger.info("Alert scan: %d alerts found, %d pushed", len(alerts), sent)
        else:
            logger.debug("Alert scan: no alerts triggered")

    except Exception as e:
        logger.error("Alert scan failed: %s", e, exc_info=True)
