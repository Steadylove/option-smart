"""Pydantic schemas for API request/response models."""

from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, Field

# ── Enums ────────────────────────────────────────────────


class OptionType(StrEnum):
    call = "call"
    put = "put"


class Direction(StrEnum):
    sell = "sell"
    buy = "buy"


class Strategy(StrEnum):
    csp = "csp"
    cc = "cc"
    bull_put_spread = "bull_put_spread"
    bear_call_spread = "bear_call_spread"
    iron_condor = "iron_condor"
    strangle = "strangle"
    custom = "custom"


class PositionStatus(StrEnum):
    open = "open"
    closed = "closed"
    rolled = "rolled"
    assigned = "assigned"


class HealthLevel(StrEnum):
    safe = "safe"
    warning = "warning"
    danger = "danger"


# ── Position schemas ─────────────────────────────────────


class PositionCreate(BaseModel):
    position_type: str = "option"  # "stock" | "option"
    symbol: str = Field(..., examples=["TQQQ.US"])
    option_symbol: str | None = None
    option_type: OptionType | None = None
    direction: Direction = Direction.buy
    strike: float | None = None
    expiry: date | None = None
    quantity: int = Field(..., ge=1)
    open_price: float = Field(..., ge=0)
    open_date: date
    cost_basis: float = Field(default=0)
    strategy: Strategy = Strategy.custom
    notes: str | None = None


class PositionUpdate(BaseModel):
    quantity: int | None = None
    open_price: float | None = None
    strategy: Strategy | None = None
    notes: str | None = None
    status: PositionStatus | None = None
    close_price: float | None = None
    close_date: date | None = None
    realized_pnl: float | None = None


class PositionOut(BaseModel):
    id: int
    position_type: str
    symbol: str
    option_symbol: str | None
    option_type: str | None
    direction: str
    strike: float | None
    expiry: date | None
    quantity: int
    open_price: float
    open_date: date
    cost_basis: float
    strategy: str
    notes: str | None
    status: str
    close_price: float | None
    close_date: date | None
    realized_pnl: float | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Position analysis schemas ────────────────────────────


class PositionHealth(BaseModel):
    level: HealthLevel
    score: int = Field(..., ge=0, le=100)
    zone: str  # "OTM Safe" / "Near ATM" / "ITM Danger"


class PositionGreeks(BaseModel):
    delta: float
    gamma: float
    theta: float
    vega: float
    rho: float


class PositionPnL(BaseModel):
    unrealized_pnl: float
    unrealized_pnl_pct: float
    current_price: float
    market_value: float  # current_price * quantity * multiplier
    cost_value: float  # open_price * quantity * multiplier


class PositionDiagnosis(BaseModel):
    position: PositionOut
    health: PositionHealth
    greeks: PositionGreeks
    pnl: PositionPnL
    dte: int
    current_spot: float
    moneyness: str  # "ITM" / "ATM" / "OTM"
    assignment_prob: float  # delta-based
    theta_per_day: float  # daily theta income for this position
    pop: float  # probability of profit
    action_hint: str  # one-line suggestion


class PortfolioSummary(BaseModel):
    total_positions: int
    total_delta: float
    total_gamma: float
    total_theta: float
    total_vega: float
    total_unrealized_pnl: float
    daily_theta_income: float  # total theta * quantity * 100
    positions_by_status: dict[str, int]
    positions_by_symbol: dict[str, int]
    positions_by_strategy: dict[str, int]
    health_counts: dict[str, int]  # safe / warning / danger


class PositionAnalysisResponse(BaseModel):
    portfolio: PortfolioSummary
    positions: list[PositionDiagnosis]
    updated_at: str


# ── Quote schemas ────────────────────────────────────────


class StockQuote(BaseModel):
    symbol: str
    last_done: str
    prev_close: str
    open: str
    high: str
    low: str
    volume: int
    turnover: str
    timestamp: str | None = None
    change_pct: float | None = None  # computed field


class OptionQuote(BaseModel):
    symbol: str
    last_done: str
    prev_close: str
    open: str
    high: str
    low: str
    volume: int
    turnover: str
    implied_volatility: str | None = None
    open_interest: int | None = None
    strike_price: str | None = None
    expiry_date: str | None = None
    direction: str | None = None  # "C" or "P"
    contract_multiplier: str | None = None
    historical_volatility: str | None = None
    underlying_symbol: str | None = None


class Greeks(BaseModel):
    delta: float
    gamma: float
    theta: float
    vega: float
    rho: float


class OptionWithGreeks(BaseModel):
    quote: OptionQuote
    greeks: Greeks
    dte: int
    pop: float  # probability of profit for seller
    annualized_return: float | None = None


class OptionChainStrike(BaseModel):
    strike: str
    call_symbol: str
    put_symbol: str
    standard: bool


class OptionChainResponse(BaseModel):
    symbol: str
    expiry_date: str
    strikes: list[OptionChainStrike]


class OptionChainWithGreeks(BaseModel):
    symbol: str
    expiry_date: str
    spot_price: str
    calls: list[OptionWithGreeks]
    puts: list[OptionWithGreeks]


class SymbolOverview(BaseModel):
    quote: StockQuote
    iv_rank: float | None = None
    iv_percentile: float | None = None
    current_iv: float | None = None


class DashboardResponse(BaseModel):
    symbols: list[SymbolOverview]
    updated_at: str
