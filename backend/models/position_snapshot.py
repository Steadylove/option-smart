"""Daily position snapshot — records position state for lifecycle tracking."""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.database import Base


class PositionSnapshot(Base):
    __tablename__ = "position_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    position_id: Mapped[int] = mapped_column(Integer, index=True)
    snapshot_date: Mapped[date] = mapped_column(Date, index=True)

    # Market state
    spot_price: Mapped[float] = mapped_column(Float)
    option_price: Mapped[float] = mapped_column(Float, default=0)
    iv: Mapped[float] = mapped_column(Float, default=0)

    # Greeks snapshot
    delta: Mapped[float] = mapped_column(Float, default=0)
    gamma: Mapped[float] = mapped_column(Float, default=0)
    theta: Mapped[float] = mapped_column(Float, default=0)
    vega: Mapped[float] = mapped_column(Float, default=0)

    # P&L
    unrealized_pnl: Mapped[float] = mapped_column(Float, default=0)
    unrealized_pnl_pct: Mapped[float] = mapped_column(Float, default=0)

    # Health
    health_score: Mapped[int] = mapped_column(Integer, default=50)
    health_level: Mapped[str] = mapped_column(String, default="safe")

    # Lifecycle events (comma-separated tags, e.g. "take_profit_50,expiry_near")
    events: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
