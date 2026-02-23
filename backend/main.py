"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.alert import router as alert_router
from backend.api.chat import router as chat_router
from backend.api.event import router as event_router
from backend.api.option_analyze import router as option_analyze_router
from backend.api.position import router as position_router
from backend.api.quote import router as quote_router
from backend.api.settings import router as settings_router
from backend.api.stress_test import router as stress_test_router
from backend.config import settings
from backend.models.chat import ChatConversation  # noqa: F401 — register tables
from backend.models.database import init_db
from backend.models.margin_ratio import SymbolMarginRatio  # noqa: F401
from backend.models.market_event import MarketEvent, MarketNews  # noqa: F401
from backend.models.position_snapshot import PositionSnapshot  # noqa: F401
from backend.models.user_settings import UserSettings  # noqa: F401
from backend.services import margin as margin_svc
from backend.services import user_settings as settings_cache
from backend.services.longbridge import get_cache_stats
from backend.services.longbridge import warmup as warmup_longbridge
from backend.tasks.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing database...")
    await init_db()
    logger.info("Database ready")
    await settings_cache.load()
    warmup_longbridge()

    # Load persisted margin ratios into memory
    from backend.models.database import async_session

    async with async_session() as db:
        await margin_svc.load_all(db)

    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="OptionSmart",
    description="OptionSmart - AI-powered option selling strategy assistant with Greeks analysis",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[f"http://localhost:{settings.frontend_port}"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(quote_router)
app.include_router(position_router)
app.include_router(stress_test_router)
app.include_router(alert_router)
app.include_router(chat_router)
app.include_router(event_router)
app.include_router(option_analyze_router)
app.include_router(settings_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "watched_symbols": settings_cache.get_watched_symbols()}


@app.get("/api/cache-stats")
async def cache_stats():
    """Debug endpoint: view cache hit/miss stats."""
    return get_cache_stats()
