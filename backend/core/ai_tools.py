"""AI tool definitions and executor — tools the AI advisor can call."""

import json
import logging
from datetime import date, timedelta

from backend.core.alert_engine import evaluate_portfolio
from backend.core.position_analyzer import build_portfolio_summary
from backend.models.schemas import PositionDiagnosis

logger = logging.getLogger(__name__)

# ── Tool JSON Schema definitions (OpenAI format) ─────────

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_portfolio_overview",
            "description": (
                "获取当前持仓组合的完整概览，包括总 Delta/Theta/Vega、"
                "未实现盈亏、健康度分布、标的集中度和可捕获的时间价值。"
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_position_list",
            "description": (
                "获取所有持仓的诊断列表，包括每个持仓的健康度、盈亏、希腊值、"
                "DTE、价内外状态和操作建议。可按标的或健康等级过滤。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol": {
                        "type": "string",
                        "description": "只看某个标的，如 TQQQ.US。不填则返回全部。",
                    },
                    "health_level": {
                        "type": "string",
                        "enum": ["safe", "warning", "danger"],
                        "description": "只看某个健康等级的持仓。不填则返回全部。",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_position_detail",
            "description": (
                "获取某个持仓的详细诊断，包括希腊值、时间价值拆解、"
                "P&L 归因、健康度和操作建议。需要提供持仓 ID。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "position_id": {
                        "type": "integer",
                        "description": "持仓 ID",
                    },
                },
                "required": ["position_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_stock_quote",
            "description": "获取某个标的的实时行情，包括最新价、涨跌幅、成交量。",
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol": {
                        "type": "string",
                        "description": "标的代码，如 TQQQ.US",
                    },
                },
                "required": ["symbol"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_stress_test",
            "description": (
                "对当前持仓组合运行压力测试。可选预设模式（价格冲击、IV 冲击、"
                "时间推移、复合场景），或自定义价格/IV 变化幅度。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "mode": {
                        "type": "string",
                        "enum": ["price", "iv", "time", "composite"],
                        "description": "预设压力测试模式",
                    },
                    "price_change_pct": {
                        "type": "number",
                        "description": "自定义：标的价格变化百分比，如 -10 表示下跌 10%",
                    },
                    "iv_change_pct": {
                        "type": "number",
                        "description": "自定义：IV 变化百分比，如 30 表示 IV 上涨 30%",
                    },
                    "days_forward": {
                        "type": "integer",
                        "description": "自定义：模拟未来 N 天后的状态",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_decision_matrix",
            "description": (
                "获取某个持仓的操作决策矩阵，对比持有到期、立即平仓、"
                "向后展期、向下/上展期等方案的期望收益、盈利概率和评分。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "position_id": {
                        "type": "integer",
                        "description": "持仓 ID",
                    },
                },
                "required": ["position_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_alerts",
            "description": "获取当前所有活跃告警，包括止盈/止损/行权风险/到期提醒等。",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_market_news",
            "description": (
                "搜索某个标的的最近新闻。支持杠杆 ETF 自动映射到底层资产"
                "（如 TQQQ→QQQ/AAPL/MSFT 等，TSLL→TSLA，NVDL→NVDA）。"
                "用于分析市场情绪、寻找价格变动原因。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol": {
                        "type": "string",
                        "description": "标的代码，如 TQQQ.US、NVDA、TSLA",
                    },
                    "days_back": {
                        "type": "integer",
                        "description": "回看天数，默认 7 天",
                    },
                },
                "required": ["symbol"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_upcoming_events",
            "description": (
                "获取未来 N 天的重要市场事件，包括相关标的的财报日期、"
                "FOMC 会议、CPI 数据发布、GDP、非农就业等。"
                "用于评估事件风险窗口期。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "days_ahead": {
                        "type": "integer",
                        "description": "展望天数，默认 14 天",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_economic_calendar",
            "description": (
                "获取未来 N 天的经济事件日历（FOMC、CPI、GDP、非农等），"
                "包括预测值和前值。用于评估宏观风险对大盘（TQQQ）的影响。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "days_ahead": {
                        "type": "integer",
                        "description": "展望天数，默认 30 天",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_price_change",
            "description": (
                "分析某个标的在某天的价格变动原因。回溯该日的新闻和经济事件，"
                "给出可能的归因分析。用于回答'为什么涨/跌'类问题。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol": {
                        "type": "string",
                        "description": "标的代码，如 TQQQ.US、NVDA",
                    },
                    "date": {
                        "type": "string",
                        "description": "日期，格式 YYYY-MM-DD。不填则为今天。",
                    },
                },
                "required": ["symbol"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "assess_event_impact",
            "description": (
                "评估某类事件（财报、FOMC、CPI 等）对持仓的潜在影响。"
                "返回事件前后的策略建议、受影响的希腊值、风险等级。"
                "用于在给出持仓建议时补充事件风险分析。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "event_type": {
                        "type": "string",
                        "enum": ["earnings", "fomc", "cpi", "gdp", "jobs"],
                        "description": "事件类型",
                    },
                    "symbol": {
                        "type": "string",
                        "description": "相关标的代码（可选）",
                    },
                },
                "required": ["event_type"],
            },
        },
    },
]


# ── Tool executor ─────────────────────────────────────────


async def execute_tool(
    name: str,
    arguments: dict,
    diagnoses: list[PositionDiagnosis],
) -> str:
    """Execute a tool call and return JSON string result."""
    try:
        result = await _dispatch(name, arguments, diagnoses)
        return json.dumps(result, ensure_ascii=False, default=str)
    except Exception as e:
        logger.error("Tool %s execution failed: %s", name, e)
        return json.dumps({"error": f"工具执行失败: {e}"}, ensure_ascii=False)


async def _dispatch(
    name: str,
    args: dict,
    diagnoses: list[PositionDiagnosis],
) -> dict:
    if name == "get_portfolio_overview":
        return _tool_portfolio_overview(diagnoses)

    if name == "get_position_list":
        return _tool_position_list(diagnoses, args.get("symbol"), args.get("health_level"))

    if name == "get_position_detail":
        return _tool_position_detail(diagnoses, args["position_id"])

    if name == "get_stock_quote":
        return await _tool_stock_quote(args["symbol"])

    if name == "run_stress_test":
        return await _tool_stress_test(diagnoses, args)

    if name == "get_decision_matrix":
        return await _tool_decision_matrix(diagnoses, args["position_id"])

    if name == "get_alerts":
        return _tool_alerts(diagnoses)

    if name == "search_market_news":
        return await _tool_search_news(args["symbol"], args.get("days_back", 7))

    if name == "get_upcoming_events":
        return await _tool_upcoming_events(args.get("days_ahead", 14))

    if name == "get_economic_calendar":
        return await _tool_economic_calendar(args.get("days_ahead", 30))

    if name == "analyze_price_change":
        return await _tool_analyze_price_change(args["symbol"], args.get("date"))

    if name == "assess_event_impact":
        return await _tool_assess_event_impact(args["event_type"], args.get("symbol"))

    return {"error": f"未知工具: {name}"}


# ── Tool implementations ─────────────────────────────────


def _tool_portfolio_overview(diagnoses: list[PositionDiagnosis]) -> dict:
    summary = build_portfolio_summary(diagnoses)
    return summary.model_dump()


def _tool_position_list(
    diagnoses: list[PositionDiagnosis],
    symbol: str | None,
    health_level: str | None,
) -> dict:
    filtered = diagnoses
    if symbol:
        filtered = [d for d in filtered if d.position.symbol == symbol]
    if health_level:
        filtered = [d for d in filtered if d.health.level.value == health_level]

    positions = []
    for d in filtered:
        p = d.position
        sym = p.symbol.replace(".US", "")
        label = f"{sym} ${p.strike} {(p.option_type or '').upper()}" if p.strike else sym
        positions.append(
            {
                "id": p.id,
                "label": label,
                "type": p.position_type,
                "direction": p.direction,
                "strategy": p.strategy,
                "dte": d.dte,
                "health": d.health.level.value,
                "health_score": d.health.score,
                "pnl": d.pnl.unrealized_pnl,
                "pnl_pct": d.pnl.unrealized_pnl_pct,
                "delta": d.greeks.delta,
                "theta": d.greeks.theta,
                "moneyness": d.moneyness,
                "action_hint": d.action_hint,
            }
        )
    return {"count": len(positions), "positions": positions}


def _tool_position_detail(diagnoses: list[PositionDiagnosis], position_id: int) -> dict:
    diag = next((d for d in diagnoses if d.position.id == position_id), None)
    if not diag:
        return {"error": f"未找到持仓 ID {position_id}"}
    return diag.model_dump()


async def _tool_stock_quote(symbol: str) -> dict:
    from backend.services.longbridge import get_stock_quotes

    if not symbol.endswith(".US"):
        symbol = f"{symbol}.US"

    quotes = get_stock_quotes((symbol,))
    if not quotes:
        return {"error": f"无法获取 {symbol} 行情"}

    q = quotes[0]
    price = float(q["last_done"])
    prev = float(q["prev_close"]) if q.get("prev_close") else price
    change_pct = ((price - prev) / prev * 100) if prev > 0 else 0
    return {
        "symbol": symbol,
        "price": price,
        "prev_close": prev,
        "change_pct": round(change_pct, 2),
        "volume": q.get("volume", 0),
    }


async def _tool_stress_test(diagnoses: list[PositionDiagnosis], args: dict) -> dict:
    from backend.core.stress_test import SCENARIO_PRESETS, run_stress_scenarios
    from backend.models.schemas import StressScenario

    mode = args.get("mode")
    if mode and mode in SCENARIO_PRESETS:
        scenarios = SCENARIO_PRESETS[mode]
    else:
        scenarios = [
            StressScenario(
                name="Custom",
                price_change_pct=args.get("price_change_pct", 0),
                iv_change_pct=args.get("iv_change_pct", 0),
                days_forward=args.get("days_forward", 0),
            )
        ]

    results = run_stress_scenarios(diagnoses, scenarios)

    summary = []
    for r in results:
        summary.append(
            {
                "scenario": r.scenario.name,
                "portfolio_pnl_change": r.portfolio_pnl_change,
                "positions_affected": len(r.positions),
            }
        )
    return {"scenarios": summary}


async def _tool_decision_matrix(diagnoses: list[PositionDiagnosis], position_id: int) -> dict:
    from backend.config import settings
    from backend.core.decision_matrix import build_decision_matrix

    diag = next((d for d in diagnoses if d.position.id == position_id), None)
    if not diag:
        return {"error": f"未找到持仓 ID {position_id}"}

    p = diag.position
    underlying = p.symbol if ".US" in p.symbol else f"{p.symbol}.US"
    q = settings.dividend_yields.get(underlying, 0.0)

    actions = build_decision_matrix(diag, settings.risk_free_rate, q)
    return {"position_id": position_id, "actions": actions}


def _tool_alerts(diagnoses: list[PositionDiagnosis]) -> dict:
    alerts = evaluate_portfolio(diagnoses)
    return {
        "total": len(alerts),
        "alerts": [a.to_dict() for a in alerts],
    }


async def _tool_search_news(symbol: str, days_back: int = 7) -> dict:
    from sqlalchemy import select

    from backend.models.database import async_session
    from backend.models.market_event import MarketNews
    from backend.services.finnhub import resolve_underlyings

    underlyings = resolve_underlyings(symbol)
    cutoff = (date.today() - timedelta(days=days_back)).isoformat()

    async with async_session() as session:
        stmt = (
            select(MarketNews)
            .where(
                MarketNews.symbol.in_(underlyings),
                MarketNews.published_at >= cutoff,
            )
            .order_by(MarketNews.published_at.desc())
            .limit(20)
        )
        result = await session.execute(stmt)
        rows = result.scalars().all()

    news_list = [
        {
            "symbol": r.symbol,
            "headline": r.headline,
            "summary": (r.summary or "")[:200],
            "source": r.source or "",
            "published_at": r.published_at,
        }
        for r in rows
    ]
    return {"symbol": symbol, "news": news_list, "total": len(news_list)}


async def _tool_upcoming_events(days_ahead: int = 14) -> dict:
    from backend.core.event_analyzer import get_upcoming_events

    events = await get_upcoming_events(days_ahead=days_ahead)
    return {"events": events, "total": len(events)}


async def _tool_economic_calendar(days_ahead: int = 30) -> dict:
    from backend.core.event_analyzer import _KNOWN_ECONOMIC_EVENTS_2026

    today = date.today()
    end = today + timedelta(days=days_ahead)
    today_str, end_str = str(today), str(end)

    events = [
        {"event": e["title"], "date": e["date"], "impact": e["impact"], "type": e["type"]}
        for e in _KNOWN_ECONOMIC_EVENTS_2026
        if today_str <= e["date"] <= end_str
    ]

    return {"events": events, "total": len(events)}


async def _tool_analyze_price_change(symbol: str, target_date: str | None = None) -> dict:
    from backend.core.event_analyzer import attribute_price_move

    d = date.fromisoformat(target_date) if target_date else date.today()
    return await attribute_price_move(symbol, d)


async def _tool_assess_event_impact(event_type: str, symbol: str | None = None) -> dict:
    from backend.core.event_analyzer import assess_event_impact

    return await assess_event_impact(event_type, symbol)
