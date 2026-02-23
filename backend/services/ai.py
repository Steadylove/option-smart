"""AI chat service — multi-provider LLM support via OpenAI-compatible APIs.

Supported providers: GLM (ZhipuAI), DeepSeek, Gemini.
Fallback: if no user API key configured, uses server-side GLM key from env.
"""

import asyncio
import json
import logging
from collections.abc import AsyncGenerator

import httpx
from langchain_core.messages import (
    AIMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_openai import ChatOpenAI

from backend.config import settings
from backend.core.ai_tools import TOOLS, build_portfolio_context, execute_tool
from backend.models.schemas import PositionDiagnosis

logger = logging.getLogger(__name__)

_MAX_TOOL_ROUNDS = 5
_USE_DEEP_THINKING = False

AI_PROVIDERS: dict[str, dict] = {
    "glm": {
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "fast_model": "glm-4-plus",
        "flash_model": "glm-4-flash",
        "deep_model": "glm-5",
        "supports_deep_thinking": True,
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com",
        "fast_model": "deepseek-chat",
        "flash_model": "deepseek-chat",
        "deep_model": "deepseek-reasoner",
        "supports_deep_thinking": False,
    },
    "gemini": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "fast_model": "gemini-2.0-flash",
        "flash_model": "gemini-2.0-flash",
        "deep_model": "gemini-2.5-flash",
        "supports_deep_thinking": False,
    },
}


def _resolve_provider() -> tuple[str, str, dict]:
    """Returns (api_key, provider_name, provider_config).

    Fallback chain: user config → server GLM key.
    """
    from backend.services.user_settings import get_ai_api_key, get_ai_provider

    provider = get_ai_provider()
    user_key = get_ai_api_key()

    if user_key and provider in AI_PROVIDERS:
        return user_key, provider, AI_PROVIDERS[provider]

    return settings.zhipuai_api_key, "glm", AI_PROVIDERS["glm"]


_SYSTEM_PROMPT_BASE = """\
你是 Robby，OptionSmart 的 AI 顾问，一个专业的期权卖方策略助手。

## 你的专业领域
- 期权卖方策略（Cash-Secured Put、Covered Call、Credit Spread、Iron Condor、Strangle）
- 标的：TQQQ、TSLL、NVDL 等杠杆 ETF
- 希腊值分析（Delta、Gamma、Theta、Vega）
- 风险管理与仓位诊断
- 市场事件分析与价格归因

## 工具调用原则 ⚠️
- 下方「当前持仓快照」已包含组合概览和全部持仓列表，**不要**再调用 get_portfolio_overview 和 get_position_list
- 只在需要某个持仓的完整诊断详情时才调用 get_position_detail
- **尽量在一轮中并行调用所有需要的工具**，减少来回轮次

## 事件驱动分析能力
- 给出持仓建议时，必须先检查该标的未来 14 天的事件（财报、FOMC、CPI 等）
- 财报前持仓策略：评估 IV 膨胀对 Theta 收益的影响，Gamma 风险加剧
- 财报后策略：IV 压缩（IV Crush）对持仓价值的影响
- FOMC/CPI 等宏观事件对 TQQQ（大盘敏感标的）影响显著，需特别提醒
- 用户询问"为什么涨/跌"时，主动搜索新闻并关联分析
- 给出操作建议时，标注事件风险窗口期

## 标的映射
- TQQQ 跟踪 QQQ / NASDAQ 100，受大盘和科技股整体影响
- TSLL 跟踪 TSLA，受特斯拉公司事件影响
- NVDL 跟踪 NVDA，受英伟达公司事件和 AI/芯片行业影响

## 回答风格
- 用中文回答，简洁专业
- 给出明确的操作建议，不要模棱两可
- 引用具体数据（价格、希腊值、盈亏比例）支撑你的判断
- 风险提示要具体，不要泛泛而谈
- 如果情况紧急（持仓处于危险区），要明确告知优先级
- 提及事件风险时，给出具体日期和预期影响
"""


def _build_system_prompt(diagnoses: list[PositionDiagnosis]) -> str:
    ctx = build_portfolio_context(diagnoses)
    return f"{_SYSTEM_PROMPT_BASE}\n## 当前持仓快照\n{ctx}"


def _llm_fast() -> ChatOpenAI:
    """Build the primary LLM — provider resolved from user settings."""
    api_key, _, config = _resolve_provider()
    return ChatOpenAI(
        base_url=config["base_url"],
        api_key=api_key,
        model=config["fast_model"],
        temperature=0.7,
        max_tokens=4096,
        timeout=60,
    )


def _to_lc_messages(messages: list[dict]) -> list:
    """Convert frontend message dicts to LangChain message objects."""
    result = []
    for m in messages:
        role = m.get("role", "")
        content = m.get("content", "")
        if role == "user":
            result.append(HumanMessage(content=content))
        elif role == "assistant":
            result.append(AIMessage(content=content))
        elif role == "system":
            result.append(SystemMessage(content=content))
    return result


def _lc_to_api(msgs: list) -> list[dict]:
    """Convert LangChain messages to ZhipuAI API dict format."""
    out: list[dict] = []
    for m in msgs:
        if isinstance(m, SystemMessage):
            out.append({"role": "system", "content": m.content})
        elif isinstance(m, HumanMessage):
            out.append({"role": "user", "content": m.content})
        elif isinstance(m, AIMessage):
            entry: dict = {"role": "assistant", "content": m.content or ""}
            if m.tool_calls:
                entry["tool_calls"] = [
                    {
                        "id": tc["id"],
                        "type": "function",
                        "function": {"name": tc["name"], "arguments": json.dumps(tc["args"])},
                    }
                    for tc in m.tool_calls
                ]
            out.append(entry)
        elif isinstance(m, ToolMessage):
            out.append({"role": "tool", "content": m.content, "tool_call_id": m.tool_call_id})
    return out


async def _stream_final(
    messages: list,
    *,
    deep_thinking: bool = False,
) -> AsyncGenerator[tuple[str, str], None]:
    """Stream the final answer. Delegates to thinking or fast path."""
    if deep_thinking or _USE_DEEP_THINKING:
        async for item in _stream_final_thinking(messages):
            yield item
        return

    async for chunk in _llm_fast().astream(messages):
        if chunk.content:
            yield ("text", chunk.content)


async def _stream_final_thinking(
    messages: list,
) -> AsyncGenerator[tuple[str, str], None]:
    """Stream via raw httpx with GLM-5 deep thinking.

    Only available when using GLM provider.
    Uses aiter_text() to avoid httpx's internal line-buffering.
    """
    api_key, _provider_name, config = _resolve_provider()

    if not config.get("supports_deep_thinking"):
        async for chunk in _llm_fast().astream(messages):
            if chunk.content:
                yield ("text", chunk.content)
        return

    api_msgs = _lc_to_api(messages)

    body = {
        "model": config["deep_model"],
        "messages": api_msgs,
        "stream": True,
        "temperature": 0.7,
        "max_tokens": 2048,
        "thinking": {"type": "enabled"},
    }

    headers = {"Authorization": f"Bearer {api_key}"}
    timeout = httpx.Timeout(30.0, read=180.0)

    async with (
        httpx.AsyncClient(timeout=timeout) as client,
        client.stream(
            "POST", f"{config['base_url']}/chat/completions", json=body, headers=headers
        ) as resp,
    ):
        resp.raise_for_status()
        buf = ""
        async for raw in resp.aiter_text():
            buf += raw
            while "\n" in buf:
                line, buf = buf.split("\n", 1)
                line = line.strip()
                if not line or not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    return
                try:
                    obj = json.loads(data)
                except json.JSONDecodeError:
                    continue
                delta = obj.get("choices", [{}])[0].get("delta", {})
                if rc := delta.get("reasoning_content"):
                    yield ("thinking", rc)
                if tc := delta.get("content"):
                    yield ("text", tc)


async def chat_with_tools(
    messages: list[dict],
    diagnoses: list[PositionDiagnosis],
) -> str:
    """Non-streaming chat with tool calling loop. Returns final text."""
    llm_with_tools = _llm_fast().bind_tools(TOOLS)
    prompt = _build_system_prompt(diagnoses)
    working = [SystemMessage(content=prompt), *_to_lc_messages(messages)]

    for _round in range(_MAX_TOOL_ROUNDS):
        response: AIMessage = await llm_with_tools.ainvoke(working)

        if not response.tool_calls:
            return response.content or ""

        working.append(response)
        for tc in response.tool_calls:
            logger.info("Tool [round %d]: %s(%s)", _round + 1, tc["name"], tc["args"])

        results = await asyncio.gather(
            *(execute_tool(tc["name"], tc["args"], diagnoses) for tc in response.tool_calls)
        )
        for tc, result in zip(response.tool_calls, results, strict=True):
            working.append(ToolMessage(content=result, tool_call_id=tc["id"]))

    response = await _llm_fast().ainvoke(working)
    return response.content or "分析超时，请尝试简化你的问题。"


async def chat_stream(
    messages: list[dict],
    diagnoses: list[PositionDiagnosis],
    *,
    deep_thinking: bool = False,
) -> AsyncGenerator[str, None]:
    """Streaming chat — resolve tool calls, then stream final answer.

    Flow: ainvoke (tool-calling) → execute tools →
          _stream_final (streaming, optionally with GLM-5 deep thinking).
    """
    llm_with_tools = _llm_fast().bind_tools(TOOLS)
    prompt = _build_system_prompt(diagnoses)
    working = [SystemMessage(content=prompt), *_to_lc_messages(messages)]

    did_tool_round = False
    for _round in range(_MAX_TOOL_ROUNDS):
        try:
            response: AIMessage = await llm_with_tools.ainvoke(working)
        except Exception as e:
            logger.error("AI invoke failed: %s", e)
            yield f"AI 服务暂时不可用: {e}"
            return

        if not response.tool_calls:
            if did_tool_round:
                # Already did tool rounds — skip to streaming instead of
                # wasting this ainvoke result (which we'd throw away anyway)
                break
            # First round, no tools needed — go straight to streaming
            break

        did_tool_round = True
        working.append(response)
        tool_names = [tc["name"] for tc in response.tool_calls]
        for tc in response.tool_calls:
            logger.info("Tool [round %d]: %s(%s)", _round + 1, tc["name"], tc["args"])

        results = await asyncio.gather(
            *(execute_tool(tc["name"], tc["args"], diagnoses) for tc in response.tool_calls)
        )
        for tc, result in zip(response.tool_calls, results, strict=True):
            working.append(ToolMessage(content=result, tool_call_id=tc["id"]))

        yield f"[TOOL:{','.join(tool_names)}]"

        # After first tool round, go directly to streaming final answer.
        # The portfolio context + tool results provide enough data.
        break

    try:
        async for event_type, content in _stream_final(working, deep_thinking=deep_thinking):
            if event_type == "thinking":
                yield f"[THINKING]{content}"
            else:
                yield content
    except Exception as e:
        logger.error("AI stream failed [%s]: %s", type(e).__name__, e, exc_info=True)
        yield f"\n\nAI 流式输出出错: {type(e).__name__}: {e}"


async def generate_title(user_message: str) -> str:
    """Generate a short conversation title using a fast/flash model."""
    try:
        api_key, _, config = _resolve_provider()
        llm = ChatOpenAI(
            base_url=config["base_url"],
            api_key=api_key,
            model=config["flash_model"],
            temperature=0.3,
            max_tokens=30,
            timeout=10,
        )
        resp = await llm.ainvoke(
            [
                SystemMessage(
                    content="根据用户的问题生成一个简短的中文对话标题（10字以内），"
                    "只输出标题本身，不要引号和标点。"
                ),
                HumanMessage(content=user_message),
            ]
        )
        title = (resp.content or "").strip().strip('"').strip("'")
        return title[:50] if title else user_message[:40]
    except Exception as e:
        logger.warning("Title generation failed: %s", e)
        return user_message[:40] + ("..." if len(user_message) > 40 else "")
