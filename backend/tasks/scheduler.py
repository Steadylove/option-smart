"""APScheduler-based task scheduler — integrates with FastAPI lifespan."""

import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from backend.services.longbridge import clear_account_cache, get_account_balance
from backend.tasks.alert_scan import run_alert_scan
from backend.tasks.daily_report import run_daily_report
from backend.tasks.event_sync import run_sync_earnings, run_sync_news, sync_news
from backend.tasks.snapshot import run_daily_snapshot

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def bootstrap_news_sync() -> None:
    """Run once on startup — backfills news if DB is empty, else no-op."""
    try:
        await sync_news()
        logger.info("Bootstrap news sync completed")
    except Exception:
        logger.exception("Bootstrap news sync failed")


def start_scheduler() -> None:
    """Register all jobs and start the scheduler."""
    scheduler.add_job(
        run_alert_scan,
        trigger=IntervalTrigger(minutes=5),
        id="alert_scan",
        name="Position alert scan",
        replace_existing=True,
    )

    scheduler.add_job(
        run_daily_report,
        trigger=CronTrigger(hour=16, minute=30, timezone="America/New_York"),
        id="daily_report",
        name="Daily portfolio report",
        replace_existing=True,
    )

    scheduler.add_job(
        run_daily_snapshot,
        trigger=CronTrigger(hour=17, minute=0, timezone="America/New_York"),
        id="daily_snapshot",
        name="Daily position snapshot",
        replace_existing=True,
    )

    # Earnings calendar — daily at 09:00 ET
    scheduler.add_job(
        run_sync_earnings,
        trigger=CronTrigger(hour=9, minute=0, timezone="America/New_York"),
        id="sync_earnings",
        name="Sync earnings calendar",
        replace_existing=True,
    )

    # News — once daily at 09:15 ET (incremental, yesterday's data)
    scheduler.add_job(
        run_sync_news,
        trigger=CronTrigger(hour=9, minute=15, timezone="America/New_York"),
        id="sync_news",
        name="Daily news sync",
        replace_existing=True,
    )

    # Account balance refresh — daily at 09:30 ET (market open)
    scheduler.add_job(
        _refresh_account_balance,
        trigger=CronTrigger(hour=9, minute=30, timezone="America/New_York"),
        id="refresh_account",
        name="Refresh account balance",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler started with %d jobs", len(scheduler.get_jobs()))

    # Fire bootstrap sync in background (backfills if DB empty)
    asyncio.get_event_loop().create_task(bootstrap_news_sync())


async def _refresh_account_balance() -> None:
    """Clear account cache and re-fetch, so the next request uses fresh data."""
    try:
        clear_account_cache()
        get_account_balance()
        logger.info("Account balance refreshed")
    except Exception:
        logger.exception("Account balance refresh failed")


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
