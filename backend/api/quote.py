"""Quote and option chain API routes."""

import logging
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.api.deps import get_session
from backend.config import settings
from backend.core.greeks import (
    calc_annualized_return,
    calc_greeks,
    calc_pop,
    market_dte,
)
from backend.core.market_hours import is_us_market_open
from backend.models.schemas import (
    DashboardResponse,
    Greeks,
    OptionChainWithGreeks,
    OptionQuote,
    OptionWithGreeks,
    StockQuote,
    SymbolOverview,
)
from backend.services import user_settings as settings_cache
from backend.services.longbridge import (
    clear_cache_for,
    get_option_chain,
    get_option_expiry_dates,
    get_option_quotes,
    get_stock_quotes,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/quote", tags=["quote"])


@router.get("/dashboard", response_model=DashboardResponse)
async def dashboard(_=Depends(get_session)):
    """Get overview for all watched symbols."""
    try:
        quotes = get_stock_quotes(tuple(sorted(settings_cache.get_watched_symbols())))
    except Exception as e:
        logger.error("Failed to fetch quotes: %s", e)
        raise HTTPException(status_code=502, detail="Failed to fetch market data")

    symbols = []
    for q in quotes:
        last = float(q["last_done"])
        prev = float(q["prev_close"])
        change_pct = round((last - prev) / prev * 100, 2) if prev else None

        stock_quote = StockQuote(**q, change_pct=change_pct)
        symbols.append(SymbolOverview(quote=stock_quote))

    return DashboardResponse(
        symbols=symbols,
        updated_at=datetime.now().isoformat(),
        market_open=is_us_market_open(),
    )


@router.get("/stock/{symbol}")
async def stock_quote(symbol: str, _=Depends(get_session)):
    """Get real-time quote for a single stock/ETF."""
    full_symbol = f"{symbol}.US" if "." not in symbol else symbol
    try:
        quotes = get_stock_quotes((full_symbol,))
    except Exception as e:
        logger.error("Failed to fetch quote for %s: %s", full_symbol, e)
        raise HTTPException(status_code=502, detail="Failed to fetch quote")

    if not quotes:
        raise HTTPException(status_code=404, detail="Symbol not found")

    q = quotes[0]
    last = float(q["last_done"])
    prev = float(q["prev_close"])
    q["change_pct"] = round((last - prev) / prev * 100, 2) if prev else None
    return StockQuote(**q)


@router.get("/option/expiries/{symbol}")
async def option_expiries(symbol: str, _=Depends(get_session)):
    """Get available option expiry dates for a symbol."""
    full_symbol = f"{symbol}.US" if "." not in symbol else symbol
    try:
        dates = get_option_expiry_dates(full_symbol)
        return {"symbol": full_symbol, "expiry_dates": [d.isoformat() for d in dates]}
    except Exception as e:
        logger.error("Failed to fetch expiries for %s: %s", full_symbol, e)
        raise HTTPException(status_code=502, detail="Failed to fetch expiry dates")


ATM_RANGE = 15  # ±15 strikes around ATM for "near" mode


@router.get("/option/chain/{symbol}", response_model=OptionChainWithGreeks)
async def option_chain_with_greeks(
    symbol: str,
    expiry: str = Query(..., description="Expiry date YYYY-MM-DD"),
    strikes: str = Query("near", pattern="^(near|all)$"),
    refresh: bool = Query(False),
    _=Depends(get_session),
):
    """Get option chain with Greeks. `strikes=near` returns ATM ± 15 only."""
    full_symbol = f"{symbol}.US" if "." not in symbol else symbol
    expiry_date = date.fromisoformat(expiry)

    if expiry_date <= date.today():
        raise HTTPException(
            status_code=400,
            detail=f"Expiry date {expiry} is in the past or today",
        )

    if refresh:
        clear_cache_for("get_option_quotes", "get_stock_quotes")

    try:
        spot_quotes = get_stock_quotes((full_symbol,))
        if not spot_quotes:
            raise HTTPException(status_code=404, detail="Symbol not found")
        spot_price = float(spot_quotes[0]["last_done"])

        chain = get_option_chain(full_symbol, expiry_date)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to fetch chain for %s: %s", full_symbol, e)
        raise HTTPException(status_code=502, detail="Failed to fetch option chain")

    total_strikes = len(chain)

    # ATM filtering: only fetch nearby strikes to reduce API load
    if strikes == "near" and total_strikes > ATM_RANGE * 2:
        sorted_chain = sorted(chain, key=lambda s: float(s["strike"]))
        atm_idx = min(
            range(len(sorted_chain)),
            key=lambda i: abs(float(sorted_chain[i]["strike"]) - spot_price),
        )
        lo = max(0, atm_idx - ATM_RANGE)
        hi = min(total_strikes, atm_idx + ATM_RANGE + 1)
        chain = sorted_chain[lo:hi]

    is_truncated = len(chain) < total_strikes

    all_symbols = []
    for strike_info in chain:
        all_symbols.append(strike_info["call_symbol"])
        all_symbols.append(strike_info["put_symbol"])

    if not all_symbols:
        raise HTTPException(status_code=404, detail="No options found")

    try:
        raw_quotes = get_option_quotes(tuple(all_symbols))
    except Exception as e:
        logger.error("Failed to fetch option quotes: %s", e)
        raise HTTPException(status_code=502, detail="Failed to fetch option quotes")

    quote_map = {q["symbol"]: q for q in raw_quotes}
    dte = market_dte(expiry_date)
    div_yield = settings.dividend_yields.get(full_symbol, 0.0)

    calls: list[OptionWithGreeks] = []
    puts: list[OptionWithGreeks] = []

    logger.info(
        "Building chain: symbol=%s, spot=%.2f, expiry=%s, dte=%d, strikes=%d/%d",
        full_symbol,
        spot_price,
        expiry,
        dte,
        len(chain),
        total_strikes,
    )

    for strike_info in chain:
        for direction, sym_key in [("C", "call_symbol"), ("P", "put_symbol")]:
            opt_sym = strike_info[sym_key]
            if opt_sym not in quote_map:
                continue

            q = quote_map[opt_sym]
            iv = float(q["implied_volatility"]) if q["implied_volatility"] else 0
            strike_val = float(q["strike_price"]) if q["strike_price"] else 0

            if iv <= 0 or strike_val <= 0:
                continue

            greeks = calc_greeks(
                spot=spot_price,
                strike=strike_val,
                dte=dte,
                iv=iv,
                rate=settings.risk_free_rate,
                q=div_yield,
                is_call=(direction == "C"),
            )

            pop = calc_pop(greeks.delta)
            premium = float(q["last_done"]) if q["last_done"] else 0
            multiplier = float(q["contract_multiplier"]) if q["contract_multiplier"] else 100
            margin = spot_price * multiplier * 0.2
            ann_ret = calc_annualized_return(premium * multiplier, margin, dte)

            opt = OptionWithGreeks(
                quote=OptionQuote(**q),
                greeks=Greeks(**greeks.__dict__),
                dte=dte,
                pop=pop,
                annualized_return=ann_ret,
            )

            if direction == "C":
                calls.append(opt)
            else:
                puts.append(opt)

    return OptionChainWithGreeks(
        symbol=full_symbol,
        expiry_date=expiry,
        spot_price=str(spot_price),
        calls=calls,
        puts=puts,
        market_open=is_us_market_open(),
        total_strikes=total_strikes,
        is_truncated=is_truncated,
    )
