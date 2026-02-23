"""AI chat service — ZhipuAI GLM with tool calling via OpenAI-compatible API."""

import json
import logging
from collections.abc import AsyncGenerator

import httpx

from backend.config import settings
from backend.core.ai_tools import TOOLS, execute_tool
from backend.models.schemas import PositionDiagnosis

logger = logging.getLogger(__name__)

_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
_MODEL = "glm-4-plus"
_MAX_TOOL_ROUNDS = 5  # prevent infinite tool-call loops

SYSTEM_PROMPT = """\
你是 OptionSmart AI 顾问，一个专业的期权卖方策略助手。

## 你的专业领域
- 期权卖方策略（Cash-Secured Put、Covered Call、Credit Spread、Iron Condor、Strangle）
- 标的：TQQQ、TSLL、NVDL 等杠杆 ETF
- 希腊值分析（Delta、Gamma、Theta、Vega）
- 风险管理与仓位诊断

## 你的能力
你可以调用工具获取实时数据：持仓概览、个股行情、持仓诊断、压力测试、决策矩阵、告警列表。
收到用户问题后，先思考需要哪些数据，主动调用工具获取，然后基于数据给出专业分析。

## 回答风格
- 用中文回答，简洁专业
- 给出明确的操作建议，不要模棱两可
- 引用具体数据（价格、希腊值、盈亏比例）支撑你的判断
- 风险提示要具体，不要泛泛而谈
- 如果情况紧急（持仓处于危险区），要明确告知优先级
"""


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.zhipuai_api_key}",
        "Content-Type": "application/json",
    }


async def chat_with_tools(
    messages: list[dict],
    diagnoses: list[PositionDiagnosis],
) -> str:
    """Non-streaming chat with tool calling loop. Returns final text."""
    working_messages = [{"role": "system", "content": SYSTEM_PROMPT}, *messages]

    for _round in range(_MAX_TOOL_ROUNDS):
        body = {
            "model": _MODEL,
            "messages": working_messages,
            "tools": TOOLS,
            "tool_choice": "auto",
            "temperature": 0.7,
            "max_tokens": 2048,
        }

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(_API_URL, headers=_headers(), json=body)
            if resp.status_code != 200:
                logger.error("ZhipuAI API error %d: %s", resp.status_code, resp.text)
                return f"AI 服务暂时不可用（错误码 {resp.status_code}），请稍后再试。"

            data = resp.json()

        choice = data["choices"][0]
        message = choice["message"]

        # No tool calls — return the text content
        if not message.get("tool_calls"):
            return message.get("content", "")

        # Process tool calls
        working_messages.append(message)

        for tc in message["tool_calls"]:
            fn_name = tc["function"]["name"]
            fn_args = json.loads(tc["function"]["arguments"])
            logger.info("AI tool call: %s(%s)", fn_name, fn_args)

            result = await execute_tool(fn_name, fn_args, diagnoses)

            working_messages.append(
                {
                    "role": "tool",
                    "content": result,
                    "tool_call_id": tc["id"],
                }
            )

    return "分析超时，请尝试简化你的问题。"


async def _stream_completion(
    working_messages: list[dict],
) -> AsyncGenerator[str, None]:
    """Make a streaming request to ZhipuAI and yield text chunks."""
    body = {
        "model": _MODEL,
        "messages": working_messages,
        "stream": True,
        "temperature": 0.7,
        "max_tokens": 2048,
    }

    async with (
        httpx.AsyncClient(timeout=120) as client,
        client.stream("POST", _API_URL, headers=_headers(), json=body) as resp,
    ):
        async for line in resp.aiter_lines():
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if payload == "[DONE]":
                return

            try:
                chunk = json.loads(payload)
                delta = chunk["choices"][0].get("delta", {})
                content = delta.get("content")
                if content:
                    yield content
            except (json.JSONDecodeError, KeyError, IndexError):
                continue


async def chat_stream(
    messages: list[dict],
    diagnoses: list[PositionDiagnosis],
) -> AsyncGenerator[str, None]:
    """Streaming chat — resolve tool calls first, then stream final answer."""
    working_messages = [{"role": "system", "content": SYSTEM_PROMPT}, *messages]

    for _round in range(_MAX_TOOL_ROUNDS):
        body = {
            "model": _MODEL,
            "messages": working_messages,
            "tools": TOOLS,
            "tool_choice": "auto",
            "temperature": 0.7,
            "max_tokens": 2048,
        }

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(_API_URL, headers=_headers(), json=body)
            if resp.status_code != 200:
                yield f"AI 服务暂时不可用（错误码 {resp.status_code}）"
                return

            data = resp.json()

        choice = data["choices"][0]
        message = choice["message"]

        if not message.get("tool_calls"):
            # No more tools — stream the final answer
            async for chunk in _stream_completion(working_messages):
                yield chunk
            return

        # Execute tools
        working_messages.append(message)
        tool_names = []

        for tc in message["tool_calls"]:
            fn_name = tc["function"]["name"]
            fn_args = json.loads(tc["function"]["arguments"])
            tool_names.append(fn_name)
            logger.info("AI tool call: %s(%s)", fn_name, fn_args)

            result = await execute_tool(fn_name, fn_args, diagnoses)
            working_messages.append(
                {
                    "role": "tool",
                    "content": result,
                    "tool_call_id": tc["id"],
                }
            )

        yield f"[TOOL:{','.join(tool_names)}]"

    # All rounds exhausted — stream whatever final answer we can get
    async for chunk in _stream_completion(working_messages):
        yield chunk
