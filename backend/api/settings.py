"""User settings API — configure watched symbols and AI provider."""

import json
import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings as app_settings
from backend.models.database import get_db
from backend.models.user_settings import UserSettings
from backend.services import user_settings as settings_cache

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsOut(BaseModel):
    watched_symbols: list[str]
    ai_provider: str
    ai_api_key_set: bool
    ai_api_key_masked: str


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
        return SettingsOut(
            watched_symbols=app_settings.watched_symbols,
            ai_provider="glm",
            ai_api_key_set=False,
            ai_api_key_masked="",
        )
    symbols = (
        json.loads(row.watched_symbols)
        if isinstance(row.watched_symbols, str)
        else row.watched_symbols
    )
    return SettingsOut(
        watched_symbols=symbols,
        ai_provider=row.ai_provider or "glm",
        ai_api_key_set=bool(row.ai_api_key),
        ai_api_key_masked=_mask_key(row.ai_api_key or ""),
    )


@router.get("", response_model=SettingsOut)
async def get_settings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserSettings).where(UserSettings.id == 1))
    return _to_out(result.scalar_one_or_none())


@router.put("", response_model=SettingsOut)
async def update_settings(data: SettingsUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserSettings).where(UserSettings.id == 1))
    row = result.scalar_one_or_none()

    if not row:
        row = UserSettings(id=1)
        db.add(row)

    if data.watched_symbols is not None:
        row.watched_symbols = json.dumps(data.watched_symbols)
    if data.ai_provider is not None:
        row.ai_provider = data.ai_provider
    if data.ai_api_key is not None:
        row.ai_api_key = data.ai_api_key

    await db.commit()
    await db.refresh(row)

    # Refresh the in-memory cache
    await settings_cache.load()

    return _to_out(row)
