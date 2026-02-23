"""Per-symbol margin ratio — persisted from Longbridge margin_ratio API."""

from sqlalchemy import Column, DateTime, Float, Integer, String
from sqlalchemy.sql import func

from backend.models.database import Base


class SymbolMarginRatio(Base):
    __tablename__ = "symbol_margin_ratios"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(20), unique=True, nullable=False, index=True)
    im_factor = Column(Float, nullable=False, default=0.5)
    mm_factor = Column(Float, nullable=False, default=0.35)
    fm_factor = Column(Float, nullable=False, default=0.3)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
