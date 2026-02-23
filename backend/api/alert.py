"""Alert API routes — real-time alert evaluation and snapshot history."""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.alert_engine import evaluate_portfolio
from backend.models.database import get_db
from backend.models.position_snapshot import PositionSnapshot
from backend.models.schemas import AlertOut, AlertsResponse, SnapshotOut
from backend.services.portfolio import load_diagnoses

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("", response_model=AlertsResponse)
async def get_alerts(
    db: AsyncSession = Depends(get_db),
):
    """Evaluate current portfolio and return all active alerts."""
    diagnoses = await load_diagnoses(db)
    raw_alerts = evaluate_portfolio(diagnoses)

    alerts = [AlertOut(**a.to_dict()) for a in raw_alerts]
    return AlertsResponse(
        alerts=alerts,
        total=len(alerts),
        updated_at=datetime.now().isoformat(),
    )


@router.get("/snapshots/{position_id}", response_model=list[SnapshotOut])
async def get_position_snapshots(
    position_id: int,
    limit: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Get historical snapshots for a position (lifecycle tracking)."""
    stmt = (
        select(PositionSnapshot)
        .where(PositionSnapshot.position_id == position_id)
        .order_by(PositionSnapshot.snapshot_date.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()
