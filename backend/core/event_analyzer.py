"""Event analysis engine — upcoming events, impact assessment, price attribution."""

import logging
from datetime import date, datetime, timedelta

from sqlalchemy import select

from backend.config import settings
from backend.models.database import async_session
from backend.models.market_event import MarketNews
from backend.services.finnhub import (
    get_earnings_calendar,
    get_stock_candles,
    resolve_underlyings,
)

logger = logging.getLogger(__name__)

# Finnhub free tier doesn't include economic calendar — use official schedules.
# Sources: federalreserve.gov, bls.gov, bea.gov. Updated annually.
_KNOWN_ECONOMIC_EVENTS_2026 = [
    # ── FOMC Decisions (source: federalreserve.gov/monetarypolicy/fomccalendars.htm) ──
    {
        "type": "fomc",
        "date": "2026-01-28",
        "title": "FOMC Interest Rate Decision (Jan)",
        "impact": "high",
    },
    {
        "type": "fomc",
        "date": "2026-03-18",
        "title": "FOMC Interest Rate Decision (Mar)",
        "impact": "high",
    },
    {
        "type": "fomc",
        "date": "2026-04-29",
        "title": "FOMC Interest Rate Decision (Apr)",
        "impact": "high",
    },
    {
        "type": "fomc",
        "date": "2026-06-17",
        "title": "FOMC Interest Rate Decision (Jun)",
        "impact": "high",
    },
    {
        "type": "fomc",
        "date": "2026-07-29",
        "title": "FOMC Interest Rate Decision (Jul)",
        "impact": "high",
    },
    {
        "type": "fomc",
        "date": "2026-09-16",
        "title": "FOMC Interest Rate Decision (Sep)",
        "impact": "high",
    },
    {
        "type": "fomc",
        "date": "2026-10-28",
        "title": "FOMC Interest Rate Decision (Oct)",
        "impact": "high",
    },
    {
        "type": "fomc",
        "date": "2026-12-09",
        "title": "FOMC Interest Rate Decision (Dec)",
        "impact": "high",
    },
    # ── FOMC Minutes (≈3 weeks after each meeting) ──
    {
        "type": "fomc",
        "date": "2026-02-18",
        "title": "FOMC Minutes (Jan Meeting)",
        "impact": "medium",
    },
    {
        "type": "fomc",
        "date": "2026-04-08",
        "title": "FOMC Minutes (Mar Meeting)",
        "impact": "medium",
    },
    {
        "type": "fomc",
        "date": "2026-05-20",
        "title": "FOMC Minutes (Apr Meeting)",
        "impact": "medium",
    },
    {
        "type": "fomc",
        "date": "2026-07-08",
        "title": "FOMC Minutes (Jun Meeting)",
        "impact": "medium",
    },
    {
        "type": "fomc",
        "date": "2026-08-19",
        "title": "FOMC Minutes (Jul Meeting)",
        "impact": "medium",
    },
    {
        "type": "fomc",
        "date": "2026-10-07",
        "title": "FOMC Minutes (Sep Meeting)",
        "impact": "medium",
    },
    {
        "type": "fomc",
        "date": "2026-11-18",
        "title": "FOMC Minutes (Oct Meeting)",
        "impact": "medium",
    },
    # ── CPI (source: bls.gov/schedule/news_release/cpi.htm) ──
    {"type": "cpi", "date": "2026-01-14", "title": "CPI Report (Dec data)", "impact": "high"},
    {"type": "cpi", "date": "2026-02-11", "title": "CPI Report (Jan data)", "impact": "high"},
    {"type": "cpi", "date": "2026-03-11", "title": "CPI Report (Feb data)", "impact": "high"},
    {"type": "cpi", "date": "2026-04-14", "title": "CPI Report (Mar data)", "impact": "high"},
    {"type": "cpi", "date": "2026-05-12", "title": "CPI Report (Apr data)", "impact": "high"},
    {"type": "cpi", "date": "2026-06-10", "title": "CPI Report (May data)", "impact": "high"},
    {"type": "cpi", "date": "2026-07-15", "title": "CPI Report (Jun data)", "impact": "high"},
    {"type": "cpi", "date": "2026-08-12", "title": "CPI Report (Jul data)", "impact": "high"},
    {"type": "cpi", "date": "2026-09-15", "title": "CPI Report (Aug data)", "impact": "high"},
    {"type": "cpi", "date": "2026-10-13", "title": "CPI Report (Sep data)", "impact": "high"},
    {"type": "cpi", "date": "2026-11-12", "title": "CPI Report (Oct data)", "impact": "high"},
    {"type": "cpi", "date": "2026-12-10", "title": "CPI Report (Nov data)", "impact": "high"},
    # ── PPI (source: bls.gov/schedule/news_release/ppi.htm) ──
    {"type": "other", "date": "2026-01-14", "title": "PPI Report (Nov data)", "impact": "medium"},
    {"type": "other", "date": "2026-01-30", "title": "PPI Report (Dec data)", "impact": "medium"},
    {"type": "other", "date": "2026-02-27", "title": "PPI Report (Jan data)", "impact": "medium"},
    {"type": "other", "date": "2026-03-18", "title": "PPI Report (Feb data)", "impact": "medium"},
    {"type": "other", "date": "2026-04-14", "title": "PPI Report (Mar data)", "impact": "medium"},
    {"type": "other", "date": "2026-05-13", "title": "PPI Report (Apr data)", "impact": "medium"},
    {"type": "other", "date": "2026-06-11", "title": "PPI Report (May data)", "impact": "medium"},
    {"type": "other", "date": "2026-07-15", "title": "PPI Report (Jun data)", "impact": "medium"},
    {"type": "other", "date": "2026-08-13", "title": "PPI Report (Jul data)", "impact": "medium"},
    {"type": "other", "date": "2026-09-10", "title": "PPI Report (Aug data)", "impact": "medium"},
    {"type": "other", "date": "2026-10-15", "title": "PPI Report (Sep data)", "impact": "medium"},
    {"type": "other", "date": "2026-11-13", "title": "PPI Report (Oct data)", "impact": "medium"},
    {"type": "other", "date": "2026-12-15", "title": "PPI Report (Nov data)", "impact": "medium"},
    # ── Non-Farm Payrolls (source: bls.gov/schedule/news_release/empsit.htm) ──
    {
        "type": "jobs",
        "date": "2026-01-09",
        "title": "Non-Farm Payrolls (Dec data)",
        "impact": "high",
    },
    {
        "type": "jobs",
        "date": "2026-02-06",
        "title": "Non-Farm Payrolls (Jan data)",
        "impact": "high",
    },
    {
        "type": "jobs",
        "date": "2026-03-06",
        "title": "Non-Farm Payrolls (Feb data)",
        "impact": "high",
    },
    {
        "type": "jobs",
        "date": "2026-04-03",
        "title": "Non-Farm Payrolls (Mar data)",
        "impact": "high",
    },
    {
        "type": "jobs",
        "date": "2026-05-08",
        "title": "Non-Farm Payrolls (Apr data)",
        "impact": "high",
    },
    {
        "type": "jobs",
        "date": "2026-06-05",
        "title": "Non-Farm Payrolls (May data)",
        "impact": "high",
    },
    {
        "type": "jobs",
        "date": "2026-07-02",
        "title": "Non-Farm Payrolls (Jun data)",
        "impact": "high",
    },
    {
        "type": "jobs",
        "date": "2026-08-07",
        "title": "Non-Farm Payrolls (Jul data)",
        "impact": "high",
    },
    {
        "type": "jobs",
        "date": "2026-09-04",
        "title": "Non-Farm Payrolls (Aug data)",
        "impact": "high",
    },
    {
        "type": "jobs",
        "date": "2026-10-02",
        "title": "Non-Farm Payrolls (Sep data)",
        "impact": "high",
    },
    {
        "type": "jobs",
        "date": "2026-11-06",
        "title": "Non-Farm Payrolls (Oct data)",
        "impact": "high",
    },
    {
        "type": "jobs",
        "date": "2026-12-04",
        "title": "Non-Farm Payrolls (Nov data)",
        "impact": "high",
    },
    # ── GDP Advance Estimates (source: bea.gov/news/schedule) ──
    {
        "type": "gdp",
        "date": "2026-01-29",
        "title": "GDP Advance Estimate (Q4 2025)",
        "impact": "high",
    },
    {
        "type": "gdp",
        "date": "2026-04-02",
        "title": "GDP Advance Estimate (Q1 2026)",
        "impact": "high",
    },
    {
        "type": "gdp",
        "date": "2026-07-01",
        "title": "GDP Advance Estimate (Q2 2026)",
        "impact": "high",
    },
    {
        "type": "gdp",
        "date": "2026-09-30",
        "title": "GDP Advance Estimate (Q3 2026)",
        "impact": "high",
    },
    # ── PCE / Personal Income & Outlays (source: bea.gov) ──
    {
        "type": "other",
        "date": "2026-01-22",
        "title": "PCE Price Index (Oct-Nov data)",
        "impact": "high",
    },
    {
        "type": "other",
        "date": "2026-02-20",
        "title": "PCE Price Index (Dec data)",
        "impact": "high",
    },
    {
        "type": "other",
        "date": "2026-03-27",
        "title": "PCE Price Index (Feb data)",
        "impact": "high",
    },
    {
        "type": "other",
        "date": "2026-04-30",
        "title": "PCE Price Index (Mar data)",
        "impact": "high",
    },
    {
        "type": "other",
        "date": "2026-05-29",
        "title": "PCE Price Index (Apr data)",
        "impact": "high",
    },
    {
        "type": "other",
        "date": "2026-06-26",
        "title": "PCE Price Index (May data)",
        "impact": "high",
    },
    {
        "type": "other",
        "date": "2026-07-31",
        "title": "PCE Price Index (Jun data)",
        "impact": "high",
    },
    {
        "type": "other",
        "date": "2026-08-28",
        "title": "PCE Price Index (Jul data)",
        "impact": "high",
    },
    {
        "type": "other",
        "date": "2026-10-01",
        "title": "PCE Price Index (Aug data)",
        "impact": "high",
    },
    {
        "type": "other",
        "date": "2026-10-30",
        "title": "PCE Price Index (Sep data)",
        "impact": "high",
    },
    {
        "type": "other",
        "date": "2026-11-25",
        "title": "PCE Price Index (Oct data)",
        "impact": "high",
    },
    {
        "type": "other",
        "date": "2026-12-23",
        "title": "PCE Price Index (Nov data)",
        "impact": "high",
    },
    # ── Retail Sales (source: census.gov, typically mid-month) ──
    {"type": "other", "date": "2026-01-16", "title": "Retail Sales (Dec data)", "impact": "medium"},
    {"type": "other", "date": "2026-02-17", "title": "Retail Sales (Jan data)", "impact": "medium"},
    {"type": "other", "date": "2026-03-17", "title": "Retail Sales (Feb data)", "impact": "medium"},
    {"type": "other", "date": "2026-04-15", "title": "Retail Sales (Mar data)", "impact": "medium"},
    {"type": "other", "date": "2026-05-15", "title": "Retail Sales (Apr data)", "impact": "medium"},
    {"type": "other", "date": "2026-06-16", "title": "Retail Sales (May data)", "impact": "medium"},
    {"type": "other", "date": "2026-07-16", "title": "Retail Sales (Jun data)", "impact": "medium"},
    {"type": "other", "date": "2026-08-14", "title": "Retail Sales (Jul data)", "impact": "medium"},
    {"type": "other", "date": "2026-09-16", "title": "Retail Sales (Aug data)", "impact": "medium"},
    {"type": "other", "date": "2026-10-16", "title": "Retail Sales (Sep data)", "impact": "medium"},
    {"type": "other", "date": "2026-11-17", "title": "Retail Sales (Oct data)", "impact": "medium"},
    {"type": "other", "date": "2026-12-16", "title": "Retail Sales (Nov data)", "impact": "medium"},
    # ── Options Expiration (Triple/Quad Witching — 3rd Friday of Mar/Jun/Sep/Dec) ──
    {
        "type": "other",
        "date": "2026-03-20",
        "title": "Triple Witching (Options Expiry)",
        "impact": "medium",
    },
    {
        "type": "other",
        "date": "2026-06-19",
        "title": "Triple Witching (Options Expiry)",
        "impact": "medium",
    },
    {
        "type": "other",
        "date": "2026-09-18",
        "title": "Triple Witching (Options Expiry)",
        "impact": "medium",
    },
    {
        "type": "other",
        "date": "2026-12-18",
        "title": "Triple Witching (Options Expiry)",
        "impact": "medium",
    },
]

# Finnhub uses GOOGL not GOOG, etc.
_SYMBOL_ALIASES = {"GOOG": "GOOGL"}


def _expand_underlyings(symbols: list[str]) -> set[str]:
    """Build underlying set with aliases (GOOG → also match GOOGL)."""
    result = set()
    for sym in symbols:
        for underlying in resolve_underlyings(sym):
            result.add(underlying)
            result.add(_SYMBOL_ALIASES.get(underlying, underlying))
    return result


async def get_upcoming_events(
    symbols: list[str] | None = None,
    days_ahead: int = 14,
) -> list[dict]:
    """Aggregate upcoming earnings + built-in economic events."""
    if not symbols:
        from backend.services.user_settings import get_watched_symbols

        symbols = get_watched_symbols()
    today = date.today()
    end = today + timedelta(days=days_ahead)
    events: list[dict] = []

    # Earnings calendar — extend to 60 days to catch quarterly reports
    all_underlyings = _expand_underlyings(symbols)
    search_end = today + timedelta(days=max(days_ahead, 60))

    earnings = await get_earnings_calendar(today, search_end)
    for e in earnings:
        sym = e.get("symbol", "")
        if sym not in all_underlyings:
            continue
        events.append(
            {
                "type": "earnings",
                "symbol": sym,
                "date": e.get("date", ""),
                "title": f"{sym} Earnings",
                "description": _format_earnings_desc(e),
                "impact": "high",
                "eps_estimate": e.get("epsEstimate"),
                "eps_actual": e.get("epsActual"),
                "revenue_estimate": e.get("revenueEstimate"),
            }
        )

    # Built-in economic events (FOMC, CPI, Non-Farm Payrolls)
    today_str = str(today)
    end_str = str(end)
    for eco in _KNOWN_ECONOMIC_EVENTS_2026:
        if today_str <= eco["date"] <= end_str:
            events.append(
                {
                    "type": eco["type"],
                    "symbol": None,
                    "date": eco["date"],
                    "title": eco["title"],
                    "description": "",
                    "impact": eco["impact"],
                }
            )

    events.sort(key=lambda x: x.get("date", ""))
    return events


def _format_earnings_desc(e: dict) -> str:
    parts = []
    if e.get("epsEstimate"):
        parts.append(f"EPS Est: {e['epsEstimate']}")
    if e.get("revenueEstimate"):
        rev = e["revenueEstimate"]
        if isinstance(rev, (int, float)) and rev > 1e9:
            parts.append(f"Rev Est: ${rev / 1e9:.1f}B")
        elif rev:
            parts.append(f"Rev Est: {rev}")
    if e.get("hour"):
        parts.append(f"Time: {'BMO' if e['hour'] == 'bmo' else 'AMC'}")
    return " | ".join(parts) if parts else "Earnings release"


async def assess_event_impact(
    event_type: str,
    symbol: str | None = None,
) -> dict:
    """Assess how an event type typically impacts positions.

    Returns strategic guidance for the AI to use in recommendations.
    """
    impacts = {
        "earnings": {
            "pre_event": [
                "IV通常在财报前1-2周膨胀，利于卖方收取更高权利金",
                "Gamma风险随财报临近急剧增加",
                "考虑在财报前平仓高Gamma持仓",
            ],
            "post_event": [
                "IV在财报公布后通常急剧压缩（IV Crush）",
                "如果方向判断正确，卖方可快速获利",
                "IV Crush幅度通常为财报前IV的30-60%",
            ],
            "affected_greeks": ["vega", "gamma", "iv"],
            "risk_level": "high",
        },
        "fomc": {
            "pre_event": [
                "FOMC前市场波动率通常升高",
                "对TQQQ（大盘敏感）影响显著，对个股ETF影响较小",
                "利率决议超预期时可能引发大幅波动",
            ],
            "post_event": [
                "决议公布后30分钟内波动最剧烈",
                "鸽派信号利好科技股/TQQQ，鹰派信号利空",
            ],
            "affected_greeks": ["vega", "delta"],
            "risk_level": "high",
        },
        "cpi": {
            "pre_event": [
                "CPI数据对利率预期有直接影响",
                "高于预期→鹰派预期→利空科技股",
                "低于预期→降息预期→利好成长股",
            ],
            "post_event": ["反应通常在数据公布后1小时内完成"],
            "affected_greeks": ["delta", "vega"],
            "risk_level": "high",
        },
        "gdp": {
            "pre_event": ["GDP数据反映经济健康度"],
            "post_event": ["市场反应通常温和，除非大幅偏离预期"],
            "affected_greeks": ["delta"],
            "risk_level": "medium",
        },
        "jobs": {
            "pre_event": [
                "非农数据对美联储政策路径有重要影响",
                "就业强劲→加息预期→科技股承压",
            ],
            "post_event": ["反应幅度取决于与预期的偏离程度"],
            "affected_greeks": ["delta", "vega"],
            "risk_level": "medium",
        },
    }

    info = impacts.get(
        event_type,
        {
            "pre_event": ["需关注具体事件内容"],
            "post_event": ["根据实际数据评估影响"],
            "affected_greeks": [],
            "risk_level": "low",
        },
    )

    # Add symbol-specific context
    affected_positions = []
    if symbol:
        for watched, underlyings in settings.symbol_underlying_map.items():
            if symbol in underlyings or symbol.replace(".US", "") in underlyings:
                affected_positions.append(watched)
    elif event_type in ("fomc", "cpi", "gdp", "jobs"):
        affected_positions = ["TQQQ.US"]

    return {
        "event_type": event_type,
        "symbol": symbol,
        **info,
        "affected_positions": affected_positions,
    }


async def attribute_price_move(
    symbol: str,
    target_date: date | None = None,
) -> dict:
    """Retrospective analysis: why did the price move on a given date?"""
    target_date = target_date or date.today()
    clean_sym = symbol.replace(".US", "")

    # Get price data around the target date
    candles = await get_stock_candles(
        clean_sym,
        "D",
        target_date - timedelta(days=5),
        target_date + timedelta(days=1),
    )

    price_change = None
    price_change_pct = None
    if candles and candles.get("t"):
        timestamps = candles["t"]
        closes = candles["c"]
        target_ts = int(datetime.combine(target_date, datetime.min.time()).timestamp())
        # Find closest trading day
        for i, ts in enumerate(timestamps):
            if ts >= target_ts and i > 0:
                price_change = closes[i] - closes[i - 1]
                price_change_pct = (price_change / closes[i - 1]) * 100
                break

    # Get news around that date from local DB
    cutoff_from = (target_date - timedelta(days=1)).isoformat()
    cutoff_to = (target_date + timedelta(days=1)).isoformat()
    underlyings = list(_expand_underlyings([symbol]))

    async with async_session() as session:
        stmt = (
            select(MarketNews)
            .where(
                MarketNews.symbol.in_(underlyings),
                MarketNews.published_at >= cutoff_from,
                MarketNews.published_at <= cutoff_to,
            )
            .order_by(MarketNews.published_at.desc())
            .limit(15)
        )
        result = await session.execute(stmt)
        news_rows = result.scalars().all()

    attributions: list[dict] = []
    for n in news_rows:
        attributions.append(
            {
                "type": "news",
                "headline": n.headline,
                "summary": n.summary or "",
                "source": n.source or "",
                "published_at": n.published_at,
                "url": n.url or "",
                "relevance": "high"
                if clean_sym.lower() in (n.headline or "").lower()
                else "medium",
            }
        )

    # Check built-in economic events on that date
    target_str = str(target_date)
    for eco in _KNOWN_ECONOMIC_EVENTS_2026:
        if eco["date"] == target_str:
            attributions.insert(
                0,
                {
                    "type": "economic",
                    "headline": eco["title"],
                    "summary": "",
                    "source": "Economic Calendar",
                    "published_at": eco["date"],
                    "url": "",
                    "relevance": "high",
                },
            )

    return {
        "symbol": symbol,
        "date": str(target_date),
        "price_change": round(price_change, 2) if price_change else None,
        "price_change_pct": round(price_change_pct, 2) if price_change_pct else None,
        "attributions": attributions,
    }


async def build_event_timeline(
    symbols: list[str] | None = None,
    days_back: int = 7,
    days_ahead: int = 14,
) -> dict:
    """Build a combined timeline of past and future events.

    News comes from local DB (synced daily) — no live Finnhub calls.
    """
    if not symbols:
        from backend.services.user_settings import get_watched_symbols

        symbols = get_watched_symbols()
    today = date.today()

    upcoming = await get_upcoming_events(symbols, days_ahead)

    # Recent news from DB
    all_underlyings = list(_expand_underlyings(symbols))
    cutoff = (today - timedelta(days=days_back)).isoformat()

    async with async_session() as session:
        stmt = (
            select(MarketNews)
            .where(
                MarketNews.symbol.in_(all_underlyings),
                MarketNews.published_at >= cutoff,
            )
            .order_by(MarketNews.published_at.desc())
            .limit(30)
        )
        result = await session.execute(stmt)
        news_rows = result.scalars().all()

    recent_news = [
        {
            "symbol": n.symbol,
            "headline": n.headline,
            "source": n.source or "",
            "published_at": n.published_at,
            "url": n.url or "",
        }
        for n in news_rows
    ]

    return {
        "upcoming_events": upcoming,
        "recent_news": recent_news,
        "range": {
            "from": str(today - timedelta(days=days_back)),
            "to": str(today + timedelta(days=days_ahead)),
        },
    }
