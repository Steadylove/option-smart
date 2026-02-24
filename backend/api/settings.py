"""User settings API — configure watched symbols, AI provider, and margin ratios."""

import json
import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_session
from backend.config import settings as app_settings
from backend.models.database import get_db
from backend.models.user_settings import UserSettings
from backend.services import margin as margin_svc
from backend.services import user_settings as settings_cache

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/settings", tags=["settings"])


class MarginRatioOut(BaseModel):
    symbol: str
    im_factor: float
    mm_factor: float
    fm_factor: float


class SettingsOut(BaseModel):
    watched_symbols: list[str]
    ai_provider: str
    ai_api_key_set: bool
    ai_api_key_masked: str
    margin_ratios: list[MarginRatioOut] = []


class SettingsUpdate(BaseModel):
    watched_symbols: list[str] | None = None
    ai_provider: str | None = None
    ai_api_key: str | None = None


def _mask_key(key: str) -> str:
    if not key or len(key) < 8:
        return "****" if key else ""
    return f"{'*' * (len(key) - 4)}{key[-4:]}"


def _to_out(row: UserSettings | None) -> SettingsOut:
    if not row:
        symbols = app_settings.watched_symbols
    else:
        symbols = (
            json.loads(row.watched_symbols)
            if isinstance(row.watched_symbols, str)
            else row.watched_symbols
        )

    ratios = [MarginRatioOut(symbol=sym, **margin_svc.get_factors(sym)) for sym in symbols]

    return SettingsOut(
        watched_symbols=symbols,
        ai_provider=(row.ai_provider or "glm") if row else "glm",
        ai_api_key_set=bool(row.ai_api_key) if row else False,
        ai_api_key_masked=_mask_key(row.ai_api_key or "") if row else "",
        margin_ratios=ratios,
    )


@router.get("", response_model=SettingsOut)
async def get_settings(db: AsyncSession = Depends(get_db), _=Depends(get_session)):
    result = await db.execute(select(UserSettings).where(UserSettings.id == 1))
    return _to_out(result.scalar_one_or_none())


@router.put("", response_model=SettingsOut)
async def update_settings(
    data: SettingsUpdate, db: AsyncSession = Depends(get_db), _=Depends(get_session)
):
    result = await db.execute(select(UserSettings).where(UserSettings.id == 1))
    row = result.scalar_one_or_none()

    if not row:
        row = UserSettings(id=1)
        db.add(row)

    old_symbols: list[str] = []
    if row.watched_symbols:
        old_symbols = (
            json.loads(row.watched_symbols)
            if isinstance(row.watched_symbols, str)
            else row.watched_symbols
        )

    if data.watched_symbols is not None:
        row.watched_symbols = json.dumps(data.watched_symbols)
    if data.ai_provider is not None:
        row.ai_provider = data.ai_provider
    if data.ai_api_key is not None:
        row.ai_api_key = data.ai_api_key

    await db.commit()
    await db.refresh(row)
    await settings_cache.load()

    # Auto-fetch margin ratios for newly added symbols
    if data.watched_symbols is not None:
        new_syms = [s for s in data.watched_symbols if s not in old_symbols]
        for sym in new_syms:
            await margin_svc.fetch_and_persist(sym, db)

    return _to_out(row)


@router.post("/margin-ratios/refresh", response_model=list[MarginRatioOut])
async def refresh_margin_ratios(db: AsyncSession = Depends(get_db), _=Depends(get_session)):
    """Batch refresh margin ratios for all watched symbols from Longbridge."""
    symbols = settings_cache.get_watched_symbols()
    results = await margin_svc.batch_refresh(symbols, db)
    return [MarginRatioOut(symbol=sym, **factors) for sym, factors in results.items()]
