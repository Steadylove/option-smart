"""Position ORM model for tracking stock and option positions."""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.database import Base


class Position(Base):
    __tablename__ = "positions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # "stock" or "option"
    position_type: Mapped[str] = mapped_column(String, default="option", index=True)

    # Common identifiers
    symbol: Mapped[str] = mapped_column(String, index=True)  # underlying, e.g. TQQQ.US

    # Option-specific (nullable for stock positions)
    option_symbol: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    option_type: Mapped[str | None] = mapped_column(String, nullable=True)  # "call" | "put"
    strike: Mapped[float | None] = mapped_column(Float, nullable=True)
    expiry: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Direction: "sell" | "buy" | "long" (stock holding)
    direction: Mapped[str] = mapped_column(String)

    # Position details
    quantity: Mapped[int] = mapped_column(Integer)
    open_price: Mapped[float] = mapped_column(Float)
    open_date: Mapped[date] = mapped_column(Date)
    cost_basis: Mapped[float] = mapped_column(Float)

    # Strategy context
    strategy: Mapped[str] = mapped_column(String, default="stock")
    notes: Mapped[str | None] = mapped_column(String, nullable=True)

    # Lifecycle state: "open" | "closed" | "rolled" | "assigned"
    status: Mapped[str] = mapped_column(String, default="open", index=True)
    close_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    close_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    realized_pnl: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
