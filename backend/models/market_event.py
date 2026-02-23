"""Market events and news ORM models for event-driven analysis."""

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.database import Base


class MarketEvent(Base):
    __tablename__ = "market_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(String, index=True)  # earnings/fomc/cpi/gdp/jobs/other
    symbol: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    event_date: Mapped[str] = mapped_column(String, index=True)  # ISO date string
    impact_level: Mapped[str] = mapped_column(String, default="medium")  # high/medium/low
    actual_value: Mapped[str | None] = mapped_column(String, nullable=True)
    forecast_value: Mapped[str | None] = mapped_column(String, nullable=True)
    previous_value: Mapped[str | None] = mapped_column(String, nullable=True)
    source_id: Mapped[str | None] = mapped_column(String, nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class MarketNews(Base):
    __tablename__ = "market_news"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source: Mapped[str | None] = mapped_column(String, nullable=True)
    symbol: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    headline: Mapped[str] = mapped_column(String)
    summary: Mapped[str | None] = mapped_column(String, nullable=True)
    url: Mapped[str | None] = mapped_column(String, nullable=True)
    published_at: Mapped[str] = mapped_column(String, index=True)  # ISO datetime
    finnhub_id: Mapped[int | None] = mapped_column(Integer, nullable=True, unique=True)
    sentiment: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
