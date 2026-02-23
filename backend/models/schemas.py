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


class TimeValueAnalysis(BaseModel):
    intrinsic_value: float  # per contract
    extrinsic_value: float  # per contract (time value)
    time_value_pct: float  # extrinsic / price * 100
    total_extrinsic: float  # position-level (what seller can still capture)
    theta_7d_projected: float
    theta_to_expiry_projected: float


class PnLAttribution(BaseModel):
    delta_impact_1pct: float  # P&L if spot moves +1%
    gamma_impact_1pct: float  # quadratic impact for 1% move
    theta_daily: float  # daily theta income
    vega_impact_1pct: float  # P&L if IV moves +1%


class PositionDiagnosis(BaseModel):
    position: PositionOut
    health: PositionHealth
    greeks: PositionGreeks
    pnl: PositionPnL
    dte: int
    current_spot: float
    current_iv: float = 0
    moneyness: str  # "ITM" / "ATM" / "OTM"
    assignment_prob: float  # delta-based
    theta_per_day: float  # daily theta income for this position
    pop: float  # probability of profit
    action_hint: str  # one-line suggestion
    time_value: TimeValueAnalysis | None = None
    attribution: PnLAttribution | None = None


class ConcentrationData(BaseModel):
    by_symbol: dict[str, float]  # symbol → pnl weight %
    by_direction: dict[str, int]  # sell/buy → count
    by_expiry_week: dict[str, int]  # "2025-W12" → count


class PortfolioSummary(BaseModel):
    total_positions: int
    total_delta: float
    total_gamma: float
    total_theta: float
    total_vega: float
    total_unrealized_pnl: float
    daily_theta_income: float
    positions_by_status: dict[str, int]
    positions_by_symbol: dict[str, int]
    positions_by_strategy: dict[str, int]
    health_counts: dict[str, int]
    concentration: ConcentrationData | None = None
    total_extrinsic_value: float = 0  # capturable time value across portfolio


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


# ── Stress test schemas ─────────────────────────────────


class StressScenario(BaseModel):
    name: str
    price_change_pct: float = 0
    iv_change_pct: float = 0
    days_forward: int = 0


class StressPositionResult(BaseModel):
    position_id: int
    symbol: str
    label: str  # "TQQQ $60 PUT"
    current_pnl: float
    scenario_pnl: float
    pnl_change: float
    scenario_price: float
    scenario_delta: float


class StressScenarioResult(BaseModel):
    scenario: StressScenario
    portfolio_pnl: float
    portfolio_pnl_change: float
    positions: list[StressPositionResult]


class StressTestRequest(BaseModel):
    mode: str = "price"  # "price" | "iv" | "time" | "composite" | "custom"
    custom_scenarios: list[StressScenario] | None = None


class StressTestResponse(BaseModel):
    results: list[StressScenarioResult]
    current_portfolio_pnl: float
    updated_at: str


# ── Decision matrix schemas ─────────────────────────────


class ActionAlternative(BaseModel):
    action: str
    description: str
    expected_pnl: float
    pop: float
    margin_freed: float = 0
    net_credit: float | None = None
    new_strike: float | None = None
    risk: str
    score: int


class DecisionMatrixResponse(BaseModel):
    position_id: int
    label: str
    current_pnl: float
    health_score: int
    actions: list[ActionAlternative]


# ── Alert schemas ───────────────────────────────────────


class AlertOut(BaseModel):
    type: str
    level: str  # "info" | "warning" | "critical"
    position_id: int
    symbol: str
    label: str
    title: str
    message: str
    suggested_action: str
    created_at: str


class AlertsResponse(BaseModel):
    alerts: list[AlertOut]
    total: int
    updated_at: str


# ── Snapshot schemas ────────────────────────────────────


class SnapshotOut(BaseModel):
    id: int
    position_id: int
    snapshot_date: date
    spot_price: float
    option_price: float
    iv: float
    delta: float
    gamma: float
    theta: float
    vega: float
    unrealized_pnl: float
    unrealized_pnl_pct: float
    health_score: int
    health_level: str
    events: str | None

    model_config = {"from_attributes": True}


# ── Market event schemas ──────────────────────────────


class MarketEventOut(BaseModel):
    type: str
    symbol: str | None
    date: str
    title: str
    description: str | None
    impact: str
    eps_estimate: float | None = None
    eps_actual: float | None = None
    revenue_estimate: float | None = None
    actual: str | None = None
    forecast: str | None = None
    previous: str | None = None


class MarketNewsOut(BaseModel):
    symbol: str | None
    headline: str
    summary: str | None
    source: str | None
    published_at: str
    url: str | None
    relevance: str | None = None


class UpcomingEventsResponse(BaseModel):
    events: list[MarketEventOut]
    total: int


class MarketNewsResponse(BaseModel):
    news: list[MarketNewsOut]
    total: int


class PriceAttributionResponse(BaseModel):
    symbol: str
    date: str
    price_change: float | None
    price_change_pct: float | None
    attributions: list[MarketNewsOut]


class EventTimelineResponse(BaseModel):
    upcoming_events: list[MarketEventOut]
    recent_news: list[MarketNewsOut]
    range: dict[str, str]
