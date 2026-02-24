"""Market events API — upcoming events, news, price attribution, AI analysis.

News data comes from the local DB (synced daily by event_sync tasks).
"""

import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_session
from backend.core.event_analyzer import (
    attribute_price_move,
    build_event_timeline,
    get_upcoming_events,
)
from backend.models.database import async_session, get_db
from backend.models.market_event import MarketNews
from backend.services.ai import chat_stream
from backend.services.finnhub import get_underlying_symbols, resolve_underlyings
from backend.services.portfolio import load_diagnoses

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("/upcoming")
async def upcoming_events(
    days: int = Query(14, ge=1, le=90),
    _=Depends(get_session),
):
    """Get upcoming market events (earnings, FOMC, CPI, etc.)."""
    events = await get_upcoming_events(days_ahead=days)
    return {"events": events, "total": len(events)}


@router.get("/timeline")
async def event_timeline(
    days_back: int = Query(7, ge=1, le=30),
    days_ahead: int = Query(14, ge=1, le=90),
    _=Depends(get_session),
):
    """Get a combined timeline of past news and future events."""
    return await build_event_timeline(days_back=days_back, days_ahead=days_ahead)


@router.get("/news")
async def market_news(
    symbol: str = Query("", description="Symbol like TQQQ.US or NVDA"),
    days: int = Query(7, ge=1, le=30),
    _=Depends(get_session),
):
    """Get recent news from local DB (synced daily, no live Finnhub calls)."""
    underlyings = resolve_underlyings(symbol) if symbol else get_underlying_symbols()[:5]
    cutoff = (date.today() - timedelta(days=days)).isoformat()

    async with async_session() as session:
        stmt = (
            select(MarketNews)
            .where(
                MarketNews.symbol.in_(underlyings),
                MarketNews.published_at >= cutoff,
            )
            .order_by(MarketNews.published_at.desc())
            .limit(50)
        )
        result = await session.execute(stmt)
        rows = result.scalars().all()

    news_list = [
        {
            "symbol": r.symbol,
            "headline": r.headline,
            "summary": r.summary,
            "source": r.source,
            "published_at": r.published_at,
            "url": r.url,
        }
        for r in rows
    ]

    return {"news": news_list, "total": len(news_list)}


@router.get("/attribution")
async def price_attribution(
    symbol: str = Query(..., description="Symbol like TQQQ.US or NVDA"),
    target_date: date = Query(None, alias="date"),
    _=Depends(get_session),
):
    """Analyze why price moved on a given date."""
    return await attribute_price_move(symbol, target_date)


@router.post("/analyze")
async def analyze_events(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_session),
):
    """AI-powered event analysis — streaming SSE response.

    Gathers current events + news, sends to AI with portfolio context,
    returns impact analysis and position-specific recommendations.
    """
    try:
        diagnoses = await load_diagnoses(db)
    except Exception as e:
        logger.warning("Failed to load portfolio for analysis: %s", e)
        diagnoses = []

    events = await get_upcoming_events(days_ahead=14)
    cutoff = (date.today() - timedelta(days=3)).isoformat()

    async with async_session() as session:
        stmt = (
            select(MarketNews)
            .where(MarketNews.published_at >= cutoff)
            .order_by(MarketNews.published_at.desc())
            .limit(20)
        )
        result = await session.execute(stmt)
        news_rows = result.scalars().all()

    events_text = (
        "\n".join(
            f"- [{e['date']}] {e['title']} (impact: {e['impact']})"
            + (f" — {e.get('description', '')}" if e.get("description") else "")
            for e in events[:20]
        )
        or "暂无近期事件"
    )

    news_text = (
        "\n".join(f"- [{n.published_at[:10]}] [{n.symbol}] {n.headline}" for n in news_rows)
        or "暂无近期新闻"
    )

    prompt = (
        "请对以下近期市场事件和新闻进行综合分析，要求：\n\n"
        "1. **事件影响分析**：逐一分析每个重要事件可能对相关标的股价造成的影响（方向、幅度预估、置信度）\n"
        "2. **新闻解读**：提取近期新闻中最重要的信号，判断利好/利空及影响程度\n"
        "3. **持仓建议**：结合我当前的持仓情况，给出具体的操作建议（持有/平仓/调整），标注优先级\n"
        "4. **风险窗口**：标注未来需要重点关注的日期和事件\n\n"
        f"## 未来14天事件\n{events_text}\n\n"
        f"## 近期新闻\n{news_text}\n\n"
        "请先调用工具获取我的当前持仓数据，然后给出完整分析。"
    )

    messages = [{"role": "user", "content": prompt}]

    return StreamingResponse(
        _analysis_sse(messages, diagnoses),
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


async def _analysis_sse(messages: list[dict], diagnoses):
    try:
        async for chunk in chat_stream(messages, diagnoses):
            if chunk.startswith("[TOOL:"):
                yield f"event: tool\ndata: {chunk}\n\n"
            else:
                yield _sse_data(chunk)
        yield "data: [DONE]\n\n"
    except Exception as e:
        logger.error("Event analysis stream error: %s", e, exc_info=True)
        yield _sse_data(f"分析服务出错: {e}")
        yield "data: [DONE]\n\n"
