"""Stress test API — scenario-based portfolio risk analysis."""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_session
from backend.config import settings
from backend.core.stress_test import SCENARIO_PRESETS, run_stress_scenarios
from backend.models.database import get_db
from backend.models.schemas import StressTestRequest, StressTestResponse
from backend.services.portfolio import load_diagnoses

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/stress-test", tags=["stress-test"])


@router.post("", response_model=StressTestResponse)
async def stress_test(
    body: StressTestRequest,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_session),
):
    """Run stress test scenarios against all open positions."""
    try:
        diagnoses = await load_diagnoses(db)
    except Exception as e:
        logger.error("Failed to load portfolio for stress test: %s", e)
        raise HTTPException(502, "Failed to fetch market data")

    if not diagnoses:
        return StressTestResponse(
            results=[],
            current_portfolio_pnl=0,
            updated_at=datetime.now().isoformat(),
        )

    scenarios = body.custom_scenarios or SCENARIO_PRESETS.get(body.mode, SCENARIO_PRESETS["price"])

    results = run_stress_scenarios(
        diagnoses,
        scenarios,
        settings.risk_free_rate,
        settings.dividend_yields,
    )

    current_pnl = sum(d.pnl.unrealized_pnl for d in diagnoses)

    return StressTestResponse(
        results=results,
        current_portfolio_pnl=round(current_pnl, 2),
        updated_at=datetime.now().isoformat(),
    )
