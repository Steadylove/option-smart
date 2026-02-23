"""Cached user settings — loaded at startup, refreshed on update."""

import json
import logging

from backend.config import settings as default_settings

logger = logging.getLogger(__name__)

_watched_symbols: list[str] | None = None
_ai_provider: str = "glm"
_ai_api_key: str = ""


async def load():
    """Load user settings from DB into module cache."""
    global _watched_symbols, _ai_provider, _ai_api_key

    from sqlalchemy import select

    from backend.models.database import async_session
    from backend.models.user_settings import UserSettings

    try:
        async with async_session() as db:
            result = await db.execute(select(UserSettings).where(UserSettings.id == 1))
            row = result.scalar_one_or_none()

        if row:
            raw = row.watched_symbols
            _watched_symbols = json.loads(raw) if isinstance(raw, str) else raw
            _ai_provider = row.ai_provider or "glm"
            _ai_api_key = row.ai_api_key or ""
        else:
            _watched_symbols = None
            _ai_provider = "glm"
            _ai_api_key = ""
    except Exception as e:
        logger.warning("Failed to load user settings: %s", e)


def get_watched_symbols() -> list[str]:
    return _watched_symbols or default_settings.watched_symbols


def get_ai_provider() -> str:
    return _ai_provider


def get_ai_api_key() -> str:
    return _ai_api_key
