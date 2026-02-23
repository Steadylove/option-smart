const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  health: () => request<{ status: string }>('/api/health'),
  dashboard: () => request<DashboardResponse>('/api/quote/dashboard'),
  stockQuote: (symbol: string) => request<StockQuote>(`/api/quote/stock/${symbol}`),
  optionExpiries: (symbol: string) =>
    request<{ symbol: string; expiry_dates: string[] }>(`/api/quote/option/expiries/${symbol}`),
  optionChain: (symbol: string, expiry: string, strikes = 'near', refresh = false) =>
    request<OptionChainWithGreeks>(
      `/api/quote/option/chain/${symbol}?expiry=${expiry}&strikes=${strikes}${refresh ? '&refresh=true' : ''}`,
    ),

  // Positions
  listPositions: (status = 'open') => request<PositionOut[]>(`/api/positions?status=${status}`),
  createPosition: (data: PositionCreate) =>
    request<PositionOut>('/api/positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  updatePosition: (id: number, data: Partial<PositionUpdate>) =>
    request<PositionOut>(`/api/positions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deletePosition: (id: number) => request<void>(`/api/positions/${id}`, { method: 'DELETE' }),
  closePosition: (id: number, closePrice: number) =>
    request<PositionOut>(`/api/positions/${id}/close?close_price=${closePrice}`, {
      method: 'POST',
    }),
  analyzePositions: () => request<PositionAnalysisResponse>('/api/positions/analysis'),
  syncPositions: () => request<SyncResult>('/api/positions/sync', { method: 'POST' }),

  // Stress test
  stressTest: (body: StressTestRequest) =>
    request<StressTestResponse>('/api/stress-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  // Decision matrix
  getDecisions: (positionId: number) =>
    request<DecisionMatrixResponse>(`/api/positions/${positionId}/decisions`),

  // Conversations
  listConversations: () => request<ConversationsResponse>('/api/conversations'),
  createConversation: () => request<ConversationOut>('/api/conversations', { method: 'POST' }),
  getConversation: (id: string) => request<ConversationOut>(`/api/conversations/${id}`),
  updateConversation: (id: string, data: { title?: string; pinned?: boolean }) =>
    request<ConversationOut>(`/api/conversations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deleteConversation: (id: string) =>
    request<void>(`/api/conversations/${id}`, { method: 'DELETE' }),
  sendChatMessage: (convId: string, message: string, deepThinking = false) =>
    request<{ task_id: string }>(`/api/conversations/${convId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, deep_thinking: deepThinking }),
    }),
  getChatTask: (taskId: string) => request<ChatTaskResult>(`/api/chat/task/${taskId}`),
  streamChatTask: (taskId: string, signal?: AbortSignal) =>
    fetch(`${API_BASE}/api/chat/task/${taskId}/stream`, { signal }),

  // Alerts
  getAlerts: () => request<AlertsResponse>('/api/alerts'),
  getSnapshots: (positionId: number, limit = 30) =>
    request<SnapshotOut[]>(`/api/alerts/snapshots/${positionId}?limit=${limit}`),

  // Events
  getUpcomingEvents: (days = 14) =>
    request<UpcomingEventsResponse>(`/api/events/upcoming?days=${days}`),
  getEventTimeline: (daysBack = 7, daysAhead = 14) =>
    request<EventTimelineResponse>(
      `/api/events/timeline?days_back=${daysBack}&days_ahead=${daysAhead}`,
    ),
  getMarketNews: (symbol = '', days = 7) =>
    request<MarketNewsResponse>(
      `/api/events/news?symbol=${encodeURIComponent(symbol)}&days=${days}`,
    ),
  getPriceAttribution: (symbol: string, date?: string) =>
    request<PriceAttributionResponse>(
      `/api/events/attribution?symbol=${encodeURIComponent(symbol)}${date ? `&date=${date}` : ''}`,
    ),
  analyzeEvents: () =>
    fetch(`${API_BASE}/api/events/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }),

  // Option analysis (split: account-info is fast, analyze is slow)
  optionAccountInfo: (data: OptionAnalyzeRequest) =>
    request<AccountInfoResponse>('/api/quote/option/account-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  analyzeOption: (data: OptionAnalyzeRequest) =>
    request<AiAnalysisResponse>('/api/quote/option/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  refreshAccount: () =>
    request<{ ok: boolean; account: Record<string, unknown> }>(
      '/api/quote/option/refresh-account',
      { method: 'POST' },
    ),

  // Settings
  getSettings: () => request<SettingsResponse>('/api/settings'),
  updateSettings: (data: SettingsUpdate) =>
    request<SettingsResponse>('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  refreshMarginRatios: () =>
    request<MarginRatio[]>('/api/settings/margin-ratios/refresh', { method: 'POST' }),
};

// Re-export types matching backend schemas
export interface StockQuote {
  symbol: string;
  last_done: string;
  prev_close: string;
  open: string;
  high: string;
  low: string;
  volume: number;
  turnover: string;
  timestamp: string | null;
  change_pct: number | null;
}

export interface OptionQuote {
  symbol: string;
  last_done: string;
  prev_close: string;
  volume: number;
  implied_volatility: string | null;
  open_interest: number | null;
  strike_price: string | null;
  expiry_date: string | null;
  direction: string | null;
}

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface OptionWithGreeks {
  quote: OptionQuote;
  greeks: Greeks;
  dte: number;
  pop: number;
  annualized_return: number | null;
}

export interface SymbolOverview {
  quote: StockQuote;
  iv_rank: number | null;
  iv_percentile: number | null;
  current_iv: number | null;
}

export interface DashboardResponse {
  symbols: SymbolOverview[];
  updated_at: string;
  market_open: boolean;
}

export interface OptionChainWithGreeks {
  symbol: string;
  expiry_date: string;
  spot_price: string;
  calls: OptionWithGreeks[];
  puts: OptionWithGreeks[];
  market_open: boolean;
  total_strikes: number;
  is_truncated: boolean;
}

// ── Option analysis types ───────────────────────────────

export interface OptionAnalyzeRequest {
  option_symbol: string;
  spot_price: number;
  option_data: OptionWithGreeks;
}

export interface MaxQty {
  cash_max_qty: number;
  margin_max_qty: number;
}

export interface AccountInfoResponse {
  account: Record<string, unknown>;
  sell_qty: MaxQty;
  buy_qty: MaxQty;
}

export interface AiAnalysisResponse {
  analysis: string;
}

// ── Position types ──────────────────────────────────────

export interface PositionCreate {
  position_type?: string;
  symbol: string;
  option_symbol?: string;
  option_type?: 'call' | 'put';
  direction: 'sell' | 'buy' | 'long';
  strike?: number;
  expiry?: string;
  quantity: number;
  open_price: number;
  open_date: string;
  cost_basis?: number;
  strategy?: string;
  notes?: string;
}

export interface PositionUpdate {
  quantity?: number;
  open_price?: number;
  strategy?: string;
  notes?: string;
  status?: string;
  close_price?: number;
  close_date?: string;
  realized_pnl?: number;
}

export interface PositionOut {
  id: number;
  position_type: string;
  symbol: string;
  option_symbol: string | null;
  option_type: string | null;
  direction: string;
  strike: number | null;
  expiry: string | null;
  quantity: number;
  open_price: number;
  open_date: string;
  cost_basis: number;
  strategy: string;
  notes: string | null;
  status: string;
  close_price: number | null;
  close_date: string | null;
  realized_pnl: number | null;
  created_at: string;
  updated_at: string;
}

export interface PositionHealth {
  level: 'safe' | 'warning' | 'danger';
  score: number;
  zone: string;
}

export interface PositionPnL {
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  current_price: number;
  market_value: number;
  cost_value: number;
}

export interface TimeValueAnalysis {
  intrinsic_value: number;
  extrinsic_value: number;
  time_value_pct: number;
  total_extrinsic: number;
  theta_7d_projected: number;
  theta_to_expiry_projected: number;
}

export interface PnLAttribution {
  delta_impact_1pct: number;
  gamma_impact_1pct: number;
  theta_daily: number;
  vega_impact_1pct: number;
}

export interface PositionDiagnosis {
  position: PositionOut;
  health: PositionHealth;
  greeks: Greeks;
  pnl: PositionPnL;
  dte: number;
  current_spot: number;
  current_iv: number;
  moneyness: string;
  assignment_prob: number;
  theta_per_day: number;
  pop: number;
  action_hint: string;
  time_value: TimeValueAnalysis | null;
  attribution: PnLAttribution | null;
  estimated_margin: number;
  margin_return_ann: number;
  risk_return_ann: number;
}

export interface ConcentrationData {
  by_symbol: Record<string, number>;
  by_direction: Record<string, number>;
  by_expiry_week: Record<string, number>;
}

export interface PortfolioSummary {
  total_positions: number;
  total_delta: number;
  total_gamma: number;
  total_theta: number;
  total_vega: number;
  total_unrealized_pnl: number;
  daily_theta_income: number;
  positions_by_status: Record<string, number>;
  positions_by_symbol: Record<string, number>;
  positions_by_strategy: Record<string, number>;
  health_counts: Record<string, number>;
  concentration: ConcentrationData | null;
  total_extrinsic_value: number;
}

export interface SymbolSummary {
  symbol: string;
  spot_price: number;
  position_count: number;
  total_delta: number;
  total_gamma: number;
  total_theta: number;
  total_vega: number;
  daily_theta_income: number;
  total_unrealized_pnl: number;
  total_extrinsic_value: number;
  total_estimated_margin: number;
  margin_return_ann: number;
  risk_return_ann: number;
}

export interface AccountRisk {
  net_assets: number;
  init_margin: number;
  maintenance_margin: number;
  buy_power: number;
  margin_call: number;
  risk_level: number;
  margin_utilization: number;
  total_estimated_margin: number;
  profitable_margin_freeable: number;
  theta_yield_daily: number;
  theta_yield_ann: number;
  total_cash: number;
  max_finance_amount: number;
  remaining_finance_amount: number;
  margin_safety_pct: number;
}

export interface PositionAnalysisResponse {
  portfolio: PortfolioSummary;
  by_symbol: SymbolSummary[];
  account_risk: AccountRisk | null;
  positions: PositionDiagnosis[];
  updated_at: string;
}

export interface SyncResult {
  synced: number;
  skipped: number;
  details: string[];
}

// ── Stress test types ──────────────────────────────────

export interface StressScenario {
  name: string;
  price_change_pct: number;
  iv_change_pct: number;
  days_forward: number;
}

export interface StressPositionResult {
  position_id: number;
  symbol: string;
  label: string;
  current_pnl: number;
  scenario_pnl: number;
  pnl_change: number;
  scenario_price: number;
  scenario_delta: number;
}

export interface StressScenarioResult {
  scenario: StressScenario;
  portfolio_pnl: number;
  portfolio_pnl_change: number;
  positions: StressPositionResult[];
}

export interface StressTestRequest {
  mode: 'price' | 'iv' | 'time' | 'composite' | 'custom';
  custom_scenarios?: StressScenario[];
}

export interface StressTestResponse {
  results: StressScenarioResult[];
  current_portfolio_pnl: number;
  updated_at: string;
}

// ── Decision matrix types ──────────────────────────────

export interface ActionAlternative {
  action: string;
  description: string;
  expected_pnl: number;
  pop: number;
  margin_freed: number;
  net_credit: number | null;
  new_strike: number | null;
  risk: string;
  score: number;
}

export interface DecisionMatrixResponse {
  position_id: number;
  label: string;
  current_pnl: number;
  health_score: number;
  actions: ActionAlternative[];
}

// ── Chat types ─────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface MessageOut {
  role: string;
  content: string;
  thinking?: string | null;
  tools?: string[] | null;
}

export interface ConversationOut {
  id: string;
  title: string;
  pinned: boolean;
  messages: MessageOut[];
  pending_task_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationsResponse {
  conversations: ConversationOut[];
}

export interface ChatTaskResult {
  task_id: string;
  status: string;
  content: string;
  thinking: string;
  tools: string[];
  error: string | null;
}

// ── Alert types ────────────────────────────────────────

export interface AlertOut {
  type: string;
  level: 'info' | 'warning' | 'critical';
  position_id: number;
  symbol: string;
  label: string;
  title: string;
  message: string;
  suggested_action: string;
  created_at: string;
}

export interface AlertsResponse {
  alerts: AlertOut[];
  total: number;
  updated_at: string;
}

// ── Snapshot types ─────────────────────────────────────

export interface SnapshotOut {
  id: number;
  position_id: number;
  snapshot_date: string;
  spot_price: number;
  option_price: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  health_score: number;
  health_level: string;
  events: string | null;
}

// ── Market event types ────────────────────────────────

export interface MarketEvent {
  type: string;
  symbol: string | null;
  date: string;
  title: string;
  description: string | null;
  impact: string;
  eps_estimate?: number | null;
  eps_actual?: number | null;
  revenue_estimate?: number | null;
  actual?: string | null;
  forecast?: string | null;
  previous?: string | null;
}

export interface MarketNewsItem {
  symbol: string | null;
  headline: string;
  summary: string | null;
  source: string | null;
  published_at: string;
  url: string | null;
  relevance?: string | null;
}

export interface UpcomingEventsResponse {
  events: MarketEvent[];
  total: number;
}

export interface MarketNewsResponse {
  news: MarketNewsItem[];
  total: number;
}

export interface PriceAttributionResponse {
  symbol: string;
  date: string;
  price_change: number | null;
  price_change_pct: number | null;
  attributions: MarketNewsItem[];
}

// ── Settings types ─────────────────────────────────────

export interface MarginRatio {
  symbol: string;
  im_factor: number;
  mm_factor: number;
  fm_factor: number;
}

export interface SettingsResponse {
  watched_symbols: string[];
  ai_provider: string;
  ai_api_key_set: boolean;
  ai_api_key_masked: string;
  margin_ratios: MarginRatio[];
}

export interface SettingsUpdate {
  watched_symbols?: string[];
  ai_provider?: string;
  ai_api_key?: string;
}

export interface EventTimelineResponse {
  upcoming_events: MarketEvent[];
  recent_news: MarketNewsItem[];
  range: { from: string; to: string };
}
