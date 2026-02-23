"""User settings model — single-row table for symbols and AI config."""

from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from backend.models.database import Base


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, default=1)
    watched_symbols = Column(Text, default='["TQQQ.US", "TSLL.US", "NVDL.US"]')
    ai_provider = Column(String(20), default="glm")
    ai_api_key = Column(Text, default="")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
