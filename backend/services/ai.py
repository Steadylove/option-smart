"""AI chat service — LangChain ChatOpenAI via ZhipuAI's OpenAI-compatible API.

Uses ChatOpenAI.bind_tools() for proper tool calling protocol,
eliminating XML tool-call artifacts that raw httpx integration suffered from.
"""

import logging
from collections.abc import AsyncGenerator

from langchain_core.messages import (
    AIMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_openai import ChatOpenAI

from backend.config import settings
from backend.core.ai_tools import TOOLS, execute_tool
from backend.models.schemas import PositionDiagnosis

logger = logging.getLogger(__name__)

_MAX_TOOL_ROUNDS = 10

SYSTEM_PROMPT = """\
你是 Robby，OptionSmart 的 AI 顾问，一个专业的期权卖方策略助手。

## 你的专业领域
- 期权卖方策略（Cash-Secured Put、Covered Call、Credit Spread、Iron Condor、Strangle）
- 标的：TQQQ、TSLL、NVDL 等杠杆 ETF
- 希腊值分析（Delta、Gamma、Theta、Vega）
- 风险管理与仓位诊断
- 市场事件分析与价格归因

## 你的能力
你可以调用工具获取实时数据：持仓概览、个股行情、持仓诊断、压力测试、决策矩阵、告警列表。
你还可以搜索市场新闻、查看财报/经济事件日历、分析价格变动原因、评估事件对持仓的影响。
收到用户问题后，先思考需要哪些数据，主动调用工具获取，然后基于数据给出专业分析。

## 事件驱动分析能力
- 给出持仓建议时，必须先检查该标的未来 14 天的事件（财报、FOMC、CPI 等）
- 财报前持仓策略：评估 IV 膨胀对 Theta 收益的影响，Gamma 风险加剧
- 财报后策略：IV 压缩（IV Crush）对持仓价值的影响
- FOMC/CPI 等宏观事件对 TQQQ（大盘敏感标的）影响显著，需特别提醒
- 用户询问"为什么涨/跌"时，主动搜索新闻并关联分析
- 给出操作建议时，标注事件风险窗口期（如"NVDA 财报在 3 天后，建议在此之前平仓高 Gamma 持仓"）

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


def _llm() -> ChatOpenAI:
    return ChatOpenAI(
        base_url="https://open.bigmodel.cn/api/paas/v4",
        api_key=settings.zhipuai_api_key,
        model="glm-4-plus",
        temperature=0.7,
        max_tokens=2048,
        timeout=120,
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


async def chat_with_tools(
    messages: list[dict],
    diagnoses: list[PositionDiagnosis],
) -> str:
    """Non-streaming chat with tool calling loop. Returns final text."""
    llm_with_tools = _llm().bind_tools(TOOLS)
    working = [SystemMessage(content=SYSTEM_PROMPT), *_to_lc_messages(messages)]

    for _round in range(_MAX_TOOL_ROUNDS):
        response: AIMessage = await llm_with_tools.ainvoke(working)

        if not response.tool_calls:
            return response.content or ""

        working.append(response)
        for tc in response.tool_calls:
            logger.info("Tool [round %d]: %s(%s)", _round + 1, tc["name"], tc["args"])
            result = await execute_tool(tc["name"], tc["args"], diagnoses)
            working.append(ToolMessage(content=result, tool_call_id=tc["id"]))

    # Exhausted rounds — one last attempt without tools
    response = await _llm().ainvoke(working)
    return response.content or "分析超时，请尝试简化你的问题。"


async def chat_stream(
    messages: list[dict],
    diagnoses: list[PositionDiagnosis],
) -> AsyncGenerator[str, None]:
    """Streaming chat — resolve tool calls first, then stream final answer."""
    llm_with_tools = _llm().bind_tools(TOOLS)
    working = [SystemMessage(content=SYSTEM_PROMPT), *_to_lc_messages(messages)]

    for _round in range(_MAX_TOOL_ROUNDS):
        try:
            response: AIMessage = await llm_with_tools.ainvoke(working)
        except Exception as e:
            logger.error("AI invoke failed: %s", e)
            yield f"AI 服务暂时不可用: {e}"
            return

        if not response.tool_calls:
            break

        working.append(response)
        tool_names = []
        for tc in response.tool_calls:
            tool_names.append(tc["name"])
            logger.info("Tool [round %d]: %s(%s)", _round + 1, tc["name"], tc["args"])
            result = await execute_tool(tc["name"], tc["args"], diagnoses)
            working.append(ToolMessage(content=result, tool_call_id=tc["id"]))

        yield f"[TOOL:{','.join(tool_names)}]"

    # Stream final answer — tools visible but calling explicitly disabled
    stream_llm = _llm().bind_tools(TOOLS, tool_choice="none")
    try:
        async for chunk in stream_llm.astream(working):
            if chunk.content:
                yield chunk.content
    except Exception as e:
        logger.error("AI stream failed: %s", e)
        yield f"\n\nAI 流式输出出错: {e}"
