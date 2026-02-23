"""Chat API — conversation CRUD + SSE streaming via background tasks."""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.chat import ChatConversation
from backend.models.database import get_db
from backend.services.chat_task import TaskStatus, create_task, get_task

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["chat"])


# ── Schemas ──────────────────────────────────────────────


class MessageOut(BaseModel):
    role: str
    content: str
    thinking: str | None = None
    tools: list[str] | None = None


class ConversationOut(BaseModel):
    id: str
    title: str
    pinned: bool
    messages: list[MessageOut]
    pending_task_id: str | None
    created_at: str
    updated_at: str


class ConversationUpdate(BaseModel):
    title: str | None = None
    pinned: bool | None = None


class SendMessageRequest(BaseModel):
    message: str
    deep_thinking: bool = False


# ── Helpers ──────────────────────────────────────────────


def _conv_to_out(conv: ChatConversation) -> ConversationOut:
    messages = json.loads(conv.messages_json) if conv.messages_json else []
    return ConversationOut(
        id=conv.id,
        title=conv.title,
        pinned=conv.pinned,
        messages=[MessageOut(**m) for m in messages],
        pending_task_id=conv.pending_task_id,
        created_at=conv.created_at.isoformat() + "Z",
        updated_at=conv.updated_at.isoformat() + "Z",
    )


# ── Conversation CRUD ───────────────────────────────────


@router.get("/conversations")
async def list_conversations(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatConversation).order_by(
            ChatConversation.pinned.desc(),
            ChatConversation.updated_at.desc(),
        )
    )
    convs = result.scalars().all()
    return {"conversations": [_conv_to_out(c) for c in convs]}


@router.post("/conversations")
async def create_conversation(db: AsyncSession = Depends(get_db)):
    conv = ChatConversation()
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return _conv_to_out(conv)


@router.get("/conversations/{conv_id}")
async def get_conversation(conv_id: str, db: AsyncSession = Depends(get_db)):
    conv = await db.get(ChatConversation, conv_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    return _conv_to_out(conv)


@router.put("/conversations/{conv_id}")
async def update_conversation(
    conv_id: str,
    body: ConversationUpdate,
    db: AsyncSession = Depends(get_db),
):
    conv = await db.get(ChatConversation, conv_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")

    if body.title is not None:
        conv.title = body.title
    if body.pinned is not None:
        conv.pinned = body.pinned
    await db.commit()
    await db.refresh(conv)
    return _conv_to_out(conv)


@router.delete("/conversations/{conv_id}", status_code=204)
async def delete_conversation(conv_id: str, db: AsyncSession = Depends(get_db)):
    conv = await db.get(ChatConversation, conv_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    await db.delete(conv)
    await db.commit()


# ── Send message (creates background task) ──────────────


@router.post("/conversations/{conv_id}/send")
async def send_message(
    conv_id: str,
    body: SendMessageRequest,
    db: AsyncSession = Depends(get_db),
):
    conv = await db.get(ChatConversation, conv_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")

    messages = json.loads(conv.messages_json) if conv.messages_json else []
    messages.append({"role": "user", "content": body.message})
    conv.messages_json = json.dumps(messages, ensure_ascii=False)

    # Build context for AI (only role + content)
    context = [{"role": m["role"], "content": m["content"]} for m in messages]

    task_id = create_task(conv_id, context, deep_thinking=body.deep_thinking)
    conv.pending_task_id = task_id
    await db.commit()

    return {"task_id": task_id}


# ── Task status & streaming ─────────────────────────────


@router.get("/chat/task/{task_id}")
async def get_chat_task(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found or expired")
    return {
        "task_id": task.task_id,
        "status": task.status,
        "content": task.content,
        "thinking": task.thinking,
        "tools": task.tools,
        "error": task.error,
    }


@router.get("/chat/task/{task_id}/stream")
async def stream_chat_task(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found or expired")

    return StreamingResponse(
        _task_sse_generator(task),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _sse_data(text: str) -> str:
    lines = text.split("\n")
    return "".join(f"data: {line}\n" for line in lines) + "\n"


async def _task_sse_generator(task):
    idx = 0
    while True:
        events = await task.wait_for_events(idx, timeout=15)
        if not events:
            if task.status in (TaskStatus.DONE, TaskStatus.ERROR):
                break
            yield ": keepalive\n\n"
            continue
        for ev in events:
            if ev.type == "tool":
                yield f"event: tool\ndata: {ev.data}\n\n"
            elif ev.type == "thinking":
                yield f"event: thinking\n{_sse_data(ev.data)}"
            elif ev.type == "error":
                yield _sse_data(f"Error: {ev.data}")
                yield "data: [DONE]\n\n"
                return
            elif ev.type == "done":
                yield "data: [DONE]\n\n"
                return
            else:
                yield _sse_data(ev.data)
            # Yield control so ASGI server flushes each event immediately
            await asyncio.sleep(0)
        idx += len(events)
