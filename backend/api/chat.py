"""Chat API — SSE streaming endpoint for AI advisor conversations."""

import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.database import get_db
from backend.services.ai import chat_stream, chat_with_tools
from backend.services.portfolio import load_diagnoses

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    stream: bool = True


@router.post("")
async def chat(
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    """AI advisor chat endpoint. Supports both streaming (SSE) and non-streaming."""
    messages = [m.model_dump() for m in body.messages]

    try:
        diagnoses = await load_diagnoses(db)
    except Exception as e:
        logger.warning("Failed to load portfolio for chat: %s — proceeding without data", e)
        diagnoses = []

    if body.stream:
        return StreamingResponse(
            _sse_generator(messages, diagnoses),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    # Non-streaming fallback
    reply = await chat_with_tools(messages, diagnoses)
    return {"reply": reply}


def _sse_data(text: str) -> str:
    """Format text as SSE data lines — handles newlines correctly."""
    lines = text.split("\n")
    return "".join(f"data: {line}\n" for line in lines) + "\n"


async def _sse_generator(messages: list[dict], diagnoses):
    """Wrap chat_stream as SSE events."""
    try:
        async for chunk in chat_stream(messages, diagnoses):
            if chunk.startswith("[TOOL:"):
                yield f"event: tool\ndata: {chunk}\n\n"
            else:
                yield _sse_data(chunk)
        yield "data: [DONE]\n\n"
    except Exception as e:
        logger.error("Chat stream error: %s", e, exc_info=True)
        yield _sse_data(f"抱歉，AI 服务出现错误: {e}")
        yield "data: [DONE]\n\n"
