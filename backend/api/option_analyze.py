"""Option analysis API — account info + AI analysis for a single option."""

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.database import get_db
from backend.services.ai import chat_with_tools
from backend.services.longbridge import (
    clear_account_cache,
    get_account_balance,
    get_max_purchase_quantity,
)
from backend.services.portfolio import load_diagnoses

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/quote/option", tags=["option-analyze"])

_executor = ThreadPoolExecutor(max_workers=3)


class OptionAnalyzeRequest(BaseModel):
    option_symbol: str
    spot_price: float
    option_data: dict


class AccountInfoResponse(BaseModel):
    account: dict
    sell_qty: dict
    buy_qty: dict


class AiAnalysisResponse(BaseModel):
    analysis: str


ANALYZE_PROMPT = """\
你是 Robby，期权卖方策略 AI 顾问。用户正在考虑交易以下期权合约，请给出专业分析。

## 期权合约
{option_info}

## 账户状况
- 可用资金(购买力): ${buy_power}
- 初始保证金: ${init_margin}
- 维持保证金: ${maintenance_margin}
- 风险等级: {risk_level}
- 可卖数量(现金/保证金): {sell_cash_qty}/{sell_margin_qty}
- 可买数量(现金/保证金): {buy_cash_qty}/{buy_margin_qty}

## 当前持仓
{positions_summary}

## 分析要求
1. **方向建议**: 基于当前市场环境和该期权的 Greeks，判断应该买入还是卖出，给出明确方向
2. **理由**: 从 IV 水平、Delta 安全度、Theta 收益、POP 等角度分析
3. **风险提示**: 具体的风险点（如 Gamma 风险、标的集中度、临近财报等）
4. **建议仓位**: 结合账户资金和现有持仓，建议开几张合约

请用中文回答，简洁专业，控制在 300 字以内。用 Markdown 格式。
"""


# ── Fast: account + max qty (parallel Longbridge calls) ──


@router.post("/account-info", response_model=AccountInfoResponse)
async def account_info(body: OptionAnalyzeRequest):
    """Return account balance + max buy/sell qty. Fast — uses cached data."""
    loop = asyncio.get_event_loop()

    account_fut = loop.run_in_executor(_executor, _safe_account_balance)
    sell_fut = loop.run_in_executor(
        _executor, _safe_max_qty, body.option_symbol, "sell", body.option_data
    )
    buy_fut = loop.run_in_executor(
        _executor, _safe_max_qty, body.option_symbol, "buy", body.option_data
    )

    account, sell_qty, buy_qty = await asyncio.gather(account_fut, sell_fut, buy_fut)

    return AccountInfoResponse(account=account, sell_qty=sell_qty, buy_qty=buy_qty)


# ── Slow: AI analysis ───────────────────────────────────


@router.post("/analyze", response_model=AiAnalysisResponse)
async def analyze_option(
    body: OptionAnalyzeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Return AI analysis for an option. Slower — calls LLM with tools."""
    loop = asyncio.get_event_loop()

    account_fut = loop.run_in_executor(_executor, _safe_account_balance)
    sell_fut = loop.run_in_executor(
        _executor, _safe_max_qty, body.option_symbol, "sell", body.option_data
    )
    buy_fut = loop.run_in_executor(
        _executor, _safe_max_qty, body.option_symbol, "buy", body.option_data
    )

    try:
        diagnoses = await load_diagnoses(db)
    except Exception as e:
        logger.warning("Failed to load diagnoses: %s", e)
        diagnoses = []

    account, sell_qty, buy_qty = await asyncio.gather(account_fut, sell_fut, buy_fut)

    positions_summary = (
        "暂无持仓"
        if not diagnoses
        else "\n".join(
            f"- {d.position.option_symbol or d.position.symbol}: "
            f"Delta={d.greeks.delta:.3f}, Theta={d.greeks.theta:.3f}, DTE={d.dte}"
            for d in diagnoses[:10]
        )
    )

    opt = body.option_data
    quote = opt.get("quote", {})
    greeks = opt.get("greeks", {})
    option_info = (
        f"- 合约: {body.option_symbol}\n"
        f"- 类型: {'Put' if quote.get('direction') == 'P' else 'Call'}\n"
        f"- 行权价: ${quote.get('strike_price', 'N/A')}\n"
        f"- 到期日: {quote.get('expiry_date', 'N/A')}\n"
        f"- DTE: {opt.get('dte', 'N/A')} 天\n"
        f"- 标的现价: ${body.spot_price}\n"
        f"- 最新价: ${quote.get('last_done', 'N/A')}\n"
        f"- IV: {_fmt_pct(quote.get('implied_volatility'))}\n"
        f"- Delta: {greeks.get('delta', 'N/A')}\n"
        f"- Gamma: {greeks.get('gamma', 'N/A')}\n"
        f"- Theta: {greeks.get('theta', 'N/A')}\n"
        f"- Vega: {greeks.get('vega', 'N/A')}\n"
        f"- POP: {opt.get('pop', 'N/A')}%\n"
        f"- 年化收益: {opt.get('annualized_return', 'N/A')}%"
    )

    prompt = ANALYZE_PROMPT.format(
        option_info=option_info,
        buy_power=account.get("buy_power", "N/A"),
        init_margin=account.get("init_margin", "N/A"),
        maintenance_margin=account.get("maintenance_margin", "N/A"),
        risk_level=account.get("risk_level", "N/A"),
        sell_cash_qty=sell_qty.get("cash_max_qty", 0),
        sell_margin_qty=sell_qty.get("margin_max_qty", 0),
        buy_cash_qty=buy_qty.get("cash_max_qty", 0),
        buy_margin_qty=buy_qty.get("margin_max_qty", 0),
        positions_summary=positions_summary,
    )

    try:
        analysis = await chat_with_tools(
            [{"role": "user", "content": prompt}],
            diagnoses,
        )
    except Exception as e:
        logger.error("AI analysis failed: %s", e)
        analysis = f"AI 分析暂时不可用: {e}"

    return AiAnalysisResponse(analysis=analysis)


# ── Manual refresh ───────────────────────────────────────


@router.post("/refresh-account")
async def refresh_account():
    """Manually clear account cache and re-fetch fresh data."""
    clear_account_cache()
    account = _safe_account_balance()
    return {"ok": True, "account": account}


# ── Helpers ──────────────────────────────────────────────


def _safe_account_balance() -> dict:
    try:
        return get_account_balance()
    except Exception as e:
        logger.warning("Failed to get account balance: %s", e)
        return {
            "buy_power": "N/A",
            "init_margin": "N/A",
            "maintenance_margin": "N/A",
            "risk_level": -1,
        }


def _safe_max_qty(symbol: str, side: str, option_data: dict) -> dict:
    try:
        price = float(option_data.get("quote", {}).get("last_done", 0))
        return get_max_purchase_quantity(symbol, side, price or None)
    except Exception as e:
        logger.warning("Failed to get max %s qty for %s: %s", side, symbol, e)
        return {"cash_max_qty": 0, "margin_max_qty": 0}


def _fmt_pct(val) -> str:
    if val is None:
        return "N/A"
    try:
        return f"{float(val) * 100:.1f}%"
    except (ValueError, TypeError):
        return str(val)
