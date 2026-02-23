"""Chat conversation persistence model."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.database import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


class ChatConversation(Base):
    __tablename__ = "chat_conversations"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=_new_id)
    title: Mapped[str] = mapped_column(String(200), default="New Chat")
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    messages_json: Mapped[str] = mapped_column(Text, default="[]")
    pending_task_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)
