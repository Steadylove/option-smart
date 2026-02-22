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

export interface PositionDiagnosis {
  position: PositionOut;
  health: PositionHealth;
  greeks: Greeks;
  pnl: PositionPnL;
  dte: number;
  current_spot: number;
  moneyness: string;
  assignment_prob: number;
  theta_per_day: number;
  pop: number;
  action_hint: string;
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
