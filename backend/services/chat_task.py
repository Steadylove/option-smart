"""Background chat task manager.

Runs AI chat as background asyncio tasks so responses survive client
disconnections. On completion, persists results to DB and generates title.
"""

import asyncio
import json
import logging
import time
import uuid

from backend.models.chat import ChatConversation
from backend.models.database import async_session
from backend.services.ai import chat_stream, generate_title
from backend.services.portfolio import load_diagnoses

logger = logging.getLogger(__name__)

_TASK_TTL = 3600
_MAX_TASKS = 200


class TaskStatus:
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    ERROR = "error"


class TaskEvent:
    __slots__ = ("data", "type")

    def __init__(self, type: str, data: str = ""):
        self.type = type  # "text" | "tool" | "thinking" | "error" | "done"
        self.data = data


class ChatTask:
    def __init__(self, task_id: str, conversation_id: str):
        self.task_id = task_id
        self.conversation_id = conversation_id
        self.status = TaskStatus.PENDING
        self.content = ""
        self.thinking = ""
        self.tools: list[str] = []
        self.events: list[TaskEvent] = []
        self.error: str | None = None
        self.created_at = time.time()
        self._cond = asyncio.Condition()

    async def append_event(self, event: TaskEvent) -> None:
        async with self._cond:
            self.events.append(event)
            self._cond.notify_all()

    async def wait_for_events(self, from_idx: int, timeout: float = 60.0) -> list[TaskEvent]:
        async with self._cond:
            while len(self.events) <= from_idx and self.status in (
                TaskStatus.PENDING,
                TaskStatus.RUNNING,
            ):
                try:
                    await asyncio.wait_for(self._cond.wait(), timeout=timeout)
                except TimeoutError:
                    return []
            return self.events[from_idx:]


_tasks: dict[str, ChatTask] = {}
_bg_tasks: set[asyncio.Task] = set()  # prevent GC of fire-and-forget tasks


def create_task(
    conversation_id: str,
    messages: list[dict],
    *,
    deep_thinking: bool = False,
) -> str:
    """Start a background chat task. Returns task_id immediately."""
    _evict_if_needed()
    task_id = uuid.uuid4().hex[:12]
    task = ChatTask(task_id, conversation_id)
    _tasks[task_id] = task
    asyncio.get_running_loop().create_task(_run(task, messages, deep_thinking=deep_thinking))
    return task_id


def get_task(task_id: str) -> ChatTask | None:
    return _tasks.get(task_id)


async def _run(task: ChatTask, messages: list[dict], *, deep_thinking: bool = False) -> None:
    task.status = TaskStatus.RUNNING
    try:
        first_user = next((m["content"] for m in messages if m["role"] == "user"), None)
        if first_user:
            t = asyncio.create_task(_generate_title_now(task.conversation_id, first_user))
            _bg_tasks.add(t)
            t.add_done_callback(_bg_tasks.discard)

        async with async_session() as db:
            diagnoses = await load_diagnoses(db)

        async for chunk in chat_stream(messages, diagnoses, deep_thinking=deep_thinking):
            if chunk.startswith("[TOOL:"):
                tool_str = chunk.removeprefix("[TOOL:").removesuffix("]")
                task.tools.extend(t for t in tool_str.split(",") if t)
                await task.append_event(TaskEvent("tool", chunk))
            elif chunk.startswith("[THINKING]"):
                thinking_text = chunk.removeprefix("[THINKING]")
                task.thinking += thinking_text
                await task.append_event(TaskEvent("thinking", thinking_text))
            else:
                task.content += chunk
                await task.append_event(TaskEvent("text", chunk))

        task.status = TaskStatus.DONE
        await task.append_event(TaskEvent("done"))

        # Persist to database
        await _persist_result(task)
    except Exception as e:
        logger.error("Chat task %s failed: %s", task.task_id, e, exc_info=True)
        task.status = TaskStatus.ERROR
        task.error = str(e)
        await task.append_event(TaskEvent("error", str(e)))
        await _clear_pending(task.conversation_id)


async def _generate_title_now(conversation_id: str, user_message: str) -> None:
    """Generate title immediately when the first message is sent."""
    try:
        async with async_session() as db:
            conv = await db.get(ChatConversation, conversation_id)
            if not conv or conv.title != "New Chat":
                return
            title = await generate_title(user_message)
            conv.title = title
            await db.commit()
            logger.info("Generated title for %s: %s", conv.id, title)
    except Exception as e:
        logger.warning("Early title generation failed for %s: %s", conversation_id, e)


async def _persist_result(task: ChatTask) -> None:
    """Save completed task result to DB."""
    try:
        async with async_session() as db:
            conv = await db.get(ChatConversation, task.conversation_id)
            if not conv:
                logger.warning(
                    "Conversation %s not found for task %s", task.conversation_id, task.task_id
                )
                return

            messages = json.loads(conv.messages_json)
            assistant_msg: dict = {"role": "assistant", "content": task.content}
            if task.thinking:
                assistant_msg["thinking"] = task.thinking
            if task.tools:
                assistant_msg["tools"] = task.tools
            messages.append(assistant_msg)

            conv.messages_json = json.dumps(messages, ensure_ascii=False)
            conv.pending_task_id = None
            await db.commit()
    except Exception as e:
        logger.error("Failed to persist task %s result: %s", task.task_id, e)


async def _clear_pending(conversation_id: str) -> None:
    try:
        async with async_session() as db:
            conv = await db.get(ChatConversation, conversation_id)
            if conv:
                conv.pending_task_id = None
                await db.commit()
    except Exception:
        pass


def _evict_if_needed() -> None:
    now = time.time()
    expired = [tid for tid, t in _tasks.items() if now - t.created_at > _TASK_TTL]
    for tid in expired:
        del _tasks[tid]

    if len(_tasks) > _MAX_TASKS:
        by_age = sorted(_tasks.values(), key=lambda t: t.created_at)
        for t in by_age[: len(_tasks) - _MAX_TASKS]:
            _tasks.pop(t.task_id, None)
