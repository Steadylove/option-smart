"""APScheduler-based task scheduler — integrates with FastAPI lifespan."""

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from backend.tasks.alert_scan import run_alert_scan
from backend.tasks.daily_report import run_daily_report
from backend.tasks.snapshot import run_daily_snapshot

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


def start_scheduler() -> None:
    """Register all jobs and start the scheduler."""
    # Scan positions for alerts every 5 minutes during US market hours
    scheduler.add_job(
        run_alert_scan,
        trigger=IntervalTrigger(minutes=5),
        id="alert_scan",
        name="Position alert scan",
        replace_existing=True,
    )

    # Daily report at 16:30 ET (market close + 30min buffer)
    scheduler.add_job(
        run_daily_report,
        trigger=CronTrigger(hour=16, minute=30, timezone="America/New_York"),
        id="daily_report",
        name="Daily portfolio report",
        replace_existing=True,
    )

    # Daily snapshot at 17:00 ET
    scheduler.add_job(
        run_daily_snapshot,
        trigger=CronTrigger(hour=17, minute=0, timezone="America/New_York"),
        id="daily_snapshot",
        name="Daily position snapshot",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler started with %d jobs", len(scheduler.get_jobs()))


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
