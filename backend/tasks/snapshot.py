"""Daily position snapshot — persists portfolio state for lifecycle tracking."""

import logging
from datetime import date

from backend.core.alert_engine import evaluate_position
from backend.models.database import async_session
from backend.models.position_snapshot import PositionSnapshot
from backend.services.portfolio import load_diagnoses

logger = logging.getLogger(__name__)


async def run_daily_snapshot() -> None:
    """Scheduled task: save a snapshot of each open position's state."""
    try:
        async with async_session() as db:
            diagnoses = await load_diagnoses(db)

            if not diagnoses:
                logger.debug("No open positions — skipping snapshot")
                return

            today = date.today()
            count = 0

            for diag in diagnoses:
                # Collect triggered alert types as event tags
                alerts = evaluate_position(diag)
                event_tags = ",".join(a.type for a in alerts) if alerts else None

                snapshot = PositionSnapshot(
                    position_id=diag.position.id,
                    snapshot_date=today,
                    spot_price=diag.current_spot,
                    option_price=diag.pnl.current_price,
                    iv=diag.current_iv,
                    delta=diag.greeks.delta,
                    gamma=diag.greeks.gamma,
                    theta=diag.greeks.theta,
                    vega=diag.greeks.vega,
                    unrealized_pnl=diag.pnl.unrealized_pnl,
                    unrealized_pnl_pct=diag.pnl.unrealized_pnl_pct,
                    health_score=diag.health.score,
                    health_level=diag.health.level.value,
                    events=event_tags,
                )
                db.add(snapshot)
                count += 1

            await db.commit()
            logger.info("Saved %d position snapshots for %s", count, today)

    except Exception as e:
        logger.error("Daily snapshot failed: %s", e, exc_info=True)
