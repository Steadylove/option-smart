"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.position import router as position_router
from backend.api.quote import router as quote_router
from backend.api.stress_test import router as stress_test_router
from backend.config import settings
from backend.models.database import init_db
from backend.services.longbridge import get_cache_stats

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
    yield


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


@app.get("/api/health")
async def health():
    return {"status": "ok", "watched_symbols": settings.watched_symbols}


@app.get("/api/cache-stats")
async def cache_stats():
    """Debug endpoint: view cache hit/miss stats."""
    return get_cache_stats()
