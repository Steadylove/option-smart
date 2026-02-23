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
  optionChain: (symbol: string, expiry: string) =>
    request<OptionChainWithGreeks>(`/api/quote/option/chain/${symbol}?expiry=${expiry}`),

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

  // Chat
  chat: (messages: ChatMessage[], stream = true) =>
    fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, stream }),
    }),

  // Alerts
  getAlerts: () => request<AlertsResponse>('/api/alerts'),
  getSnapshots: (positionId: number, limit = 30) =>
    request<SnapshotOut[]>(`/api/alerts/snapshots/${positionId}?limit=${limit}`),
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
}

export interface OptionChainWithGreeks {
  symbol: string;
  expiry_date: string;
  spot_price: string;
  calls: OptionWithGreeks[];
  puts: OptionWithGreeks[];
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

export interface PositionAnalysisResponse {
  portfolio: PortfolioSummary;
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
