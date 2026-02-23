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
                "（如 TQQQ->QQQ/AAPL/MSFT 等，TSLL->TSLA，NVDL->NVDA）。"
                "返回包含 headline、summary、url 等字段。"
                "展示新闻时必须用 [标题](url) 格式附带链接。"
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
    {
        "type": "function",
        "function": {
            "name": "get_metric_definitions",
            "description": (
                "获取系统中各项指标的计算公式和含义说明。"
                "当用户询问某个指标怎么算的、代表什么意思时调用此工具。"
                "可按类别筛选：greeks（希腊值）、margin（保证金）、"
                "efficiency（效率指标）、pnl（盈亏）、risk（风险）、all（全部）。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": ["greeks", "margin", "efficiency", "pnl", "risk", "all"],
                        "description": "指标类别，不确定就用 all",
                    },
                },
                "required": [],
            },
        },
    },
]


def build_portfolio_context(diagnoses: list[PositionDiagnosis]) -> str:
    """Build a compact portfolio summary to inject into system prompt,
    so the AI doesn't need to waste a tool round fetching overview + position list.
    """
    if not diagnoses:
        return "当前无持仓。"

    summary = build_portfolio_summary(diagnoses)
    lines = [
        f"组合Delta={summary.total_delta:.1f} Theta={summary.total_theta:.2f} "
        f"Vega={summary.total_vega:.2f} 未实现盈亏=${summary.total_unrealized_pnl:.2f}",
        "",
        "持仓列表:",
    ]
    for d in diagnoses:
        p = d.position
        sym = p.symbol.replace(".US", "")
        label = f"{sym} ${p.strike} {(p.option_type or '').upper()}" if p.strike else sym
        lines.append(
            f"  [{p.id}] {label} {p.direction} {p.quantity}{'张' if p.position_type == 'option' else '股'} "
            f"DTE={d.dte} 健康={d.health.level.value}({d.health.score}) "
            f"盈亏={d.pnl.unrealized_pnl:+.2f}({d.pnl.unrealized_pnl_pct:+.1f}%) "
            f"Δ={d.greeks.delta:.2f} θ={d.greeks.theta:.2f} "
            f"{'建议: ' + d.action_hint if d.action_hint else ''}"
        )
    return "\n".join(lines)


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

    if name == "get_metric_definitions":
        return _tool_metric_definitions(args.get("category", "all"))

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
    from backend.config import settings
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

    results = run_stress_scenarios(
        diagnoses, scenarios, settings.risk_free_rate, settings.dividend_yields
    )

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
            .limit(10)
        )
        result = await session.execute(stmt)
        rows = result.scalars().all()

    news_list = [
        {
            "symbol": r.symbol,
            "headline": r.headline,
            "summary": (r.summary or "")[:100],
            "source": r.source or "",
            "url": r.url or "",
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


# ── Metric definitions (on-demand context) ───────────────

_METRIC_DEFS: dict[str, list[dict]] = {
    "greeks": [
        {
            "name": "Delta",
            "formula": "BSM d1 = [ln(S/K) + (r - q + sigma^2/2)*T] / (sigma*sqrt(T)); delta_call = N(d1), delta_put = N(d1) - 1",
            "meaning": "spot +$1 => position P&L change (multiplied by 100*qty for options)",
            "display": "per-position and aggregated per-symbol / portfolio",
        },
        {
            "name": "Gamma",
            "formula": "N'(d1) / (S * sigma * sqrt(T))",
            "meaning": "delta change rate per $1 spot move; high gamma = delta unstable near ATM",
        },
        {
            "name": "Theta",
            "formula": "-(S * N'(d1) * sigma) / (2 * sqrt(T)) - r*K*exp(-r*T)*N(d2) (put: +r*K*exp(-r*T)*N(-d2))",
            "meaning": "daily time decay in $; positive for sellers = daily income",
            "display": "theta_per_day = |theta| / 365 * 100 * qty; shown as daily $ income",
        },
        {
            "name": "Vega",
            "formula": "S * sqrt(T) * N'(d1)",
            "meaning": "P&L change if IV moves +1%; high vega = sensitive to volatility",
        },
        {
            "name": "POP (Probability of Profit)",
            "formula": "sell call: N(-d1); sell put: N(d1); buy call: N(d1); buy put: N(-d1)",
            "meaning": "probability that the seller keeps the premium at expiry",
        },
    ],
    "margin": [
        {
            "name": "Estimated Margin (Options)",
            "formula": "naked put: max(20%*spot - OTM + premium, 10%*strike + premium) * 100 * qty; naked call: max(20%*spot - OTM + premium, 15%*spot + premium) * 100 * qty",
            "meaning": "Reg-T estimated margin; OTM = max(spot-strike,0) for puts, max(strike-spot,0) for calls",
            "note": "covered options = 0 margin; long options = 0 margin",
        },
        {
            "name": "Estimated Margin (Stocks)",
            "formula": "spot * qty * im_factor",
            "meaning": "im_factor from Longbridge margin_ratio API per symbol (e.g. 0.25 = 25%)",
        },
        {
            "name": "Margin Utilization",
            "formula": "init_margin / net_assets * 100%",
            "meaning": "how much of your net assets is locked as margin; >80% = danger zone",
        },
        {
            "name": "Margin Safety Buffer",
            "formula": "(net_assets - maintenance_margin) / net_assets * 100%",
            "meaning": "how far from margin call; <25% = warning, <10% = critical",
        },
    ],
    "efficiency": [
        {
            "name": "Margin Return Annualized",
            "formula": "theta_per_day * 365 / estimated_margin * 100%",
            "meaning": "annualized theta income per $1 margin; measures capital efficiency",
            "note": "higher = margin working harder; but doesn't account for risk",
        },
        {
            "name": "Risk-Adjusted Return Annualized",
            "formula": "theta_per_day * 365 / max_loss * 100%",
            "meaning": "annualized theta income per $1 of max potential loss",
            "note": "put max_loss = strike * 100 * qty (stock -> 0); call uses 2x spot as proxy; independent of margin, measures risk compensation",
        },
        {
            "name": "Theta Yield (Portfolio)",
            "formula": "sum(option_theta) / sum(option_margin) * 365 * 100%",
            "meaning": "portfolio-level annualized theta return on total option margin",
        },
    ],
    "pnl": [
        {
            "name": "Unrealized P&L",
            "formula": "sell: (open_price - current_price) * qty * 100; buy: (current_price - open_price) * qty * 100",
            "meaning": "paper profit/loss if closed now",
        },
        {
            "name": "Unrealized P&L %",
            "formula": "unrealized_pnl / cost_value * 100%",
            "meaning": "percentage return on the premium paid/received",
        },
        {
            "name": "Time Value (Extrinsic)",
            "formula": "option_price - intrinsic_value; intrinsic for put = max(strike-spot, 0); for call = max(spot-strike, 0)",
            "meaning": "the portion of premium that decays to 0 at expiry; this is what sellers capture",
        },
        {
            "name": "Capturable Value",
            "formula": "total_extrinsic = extrinsic_per_share * 100 * qty (for sellers)",
            "meaning": "remaining time value across all sell positions; theoretical max additional profit",
        },
    ],
    "risk": [
        {
            "name": "Health Score",
            "formula": "base 50 + adjustments for: moneyness (OTM +20, ATM -5, ITM -20), DTE (>30d +10, <14d -10, <7d -20), P&L (profitable +10, losing >50% -15), IV (extreme high/low -5), delta (>0.7 -10)",
            "meaning": "0-100 score; >70 = safe (green), 40-70 = warning (yellow), <40 = danger (red)",
        },
        {
            "name": "Assignment Probability",
            "formula": "|delta| * 100%",
            "meaning": "rough probability of being assigned; based on delta as proxy for ITM probability at expiry",
        },
        {
            "name": "Risk Level (Account)",
            "formula": "from Longbridge API: 0=safe, 1=medium, 2=early warning, 3=danger",
            "meaning": "broker-side risk assessment of overall account health",
        },
        {
            "name": "Freeable Margin",
            "formula": "sum(estimated_margin) for positions where unrealized_pnl > 0",
            "meaning": "margin that would be freed if all profitable positions are closed",
        },
    ],
}


def _tool_metric_definitions(category: str = "all") -> dict:
    if category == "all":
        metrics = []
        for cat_metrics in _METRIC_DEFS.values():
            metrics.extend(cat_metrics)
        return {"category": "all", "metrics": metrics}
    if category in _METRIC_DEFS:
        return {"category": category, "metrics": _METRIC_DEFS[category]}
    return {"error": f"unknown category: {category}", "available": list(_METRIC_DEFS.keys())}
