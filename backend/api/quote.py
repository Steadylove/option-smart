"""Quote and option chain API routes."""

import logging
from datetime import date, datetime

from fastapi import APIRouter, HTTPException, Query

from backend.config import settings
from backend.core.greeks import (
    calc_annualized_return,
    calc_greeks,
    calc_pop,
    market_dte,
)
from backend.models.schemas import (
    DashboardResponse,
    Greeks,
    OptionChainWithGreeks,
    OptionQuote,
    OptionWithGreeks,
    StockQuote,
    SymbolOverview,
)
from backend.services.longbridge import (
    get_option_chain,
    get_option_expiry_dates,
    get_option_quotes,
    get_stock_quotes,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/quote", tags=["quote"])


@router.get("/dashboard", response_model=DashboardResponse)
async def dashboard():
    """Get overview for all watched symbols."""
    try:
        quotes = get_stock_quotes(tuple(sorted(settings.watched_symbols)))
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
    )


@router.get("/stock/{symbol}")
async def stock_quote(symbol: str):
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
async def option_expiries(symbol: str):
    """Get available option expiry dates for a symbol."""
    full_symbol = f"{symbol}.US" if "." not in symbol else symbol
    try:
        dates = get_option_expiry_dates(full_symbol)
        return {"symbol": full_symbol, "expiry_dates": [d.isoformat() for d in dates]}
    except Exception as e:
        logger.error("Failed to fetch expiries for %s: %s", full_symbol, e)
        raise HTTPException(status_code=502, detail="Failed to fetch expiry dates")


@router.get("/option/chain/{symbol}", response_model=OptionChainWithGreeks)
async def option_chain_with_greeks(
    symbol: str,
    expiry: str = Query(..., description="Expiry date YYYY-MM-DD"),
):
    """Get full option chain with computed Greeks for a given expiry."""
    full_symbol = f"{symbol}.US" if "." not in symbol else symbol
    expiry_date = date.fromisoformat(expiry)

    if expiry_date <= date.today():
        raise HTTPException(
            status_code=400,
            detail=f"Expiry date {expiry} is in the past or today",
        )

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

    # Batch fetch all option quotes
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
        "Building chain: symbol=%s, spot=%.2f, expiry=%s, dte=%d, contracts=%d",
        full_symbol,
        spot_price,
        expiry,
        dte,
        len(chain),
    )

    for strike_info in chain:
        for direction, sym_key in [("C", "call_symbol"), ("P", "put_symbol")]:
            opt_sym = strike_info[sym_key]
            if opt_sym not in quote_map:
                continue

            q = quote_map[opt_sym]
            iv = float(q["implied_volatility"]) if q["implied_volatility"] else 0
            strike = float(q["strike_price"]) if q["strike_price"] else 0

            if iv <= 0 or strike <= 0:
                continue

            greeks = calc_greeks(
                spot=spot_price,
                strike=strike,
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
    )
