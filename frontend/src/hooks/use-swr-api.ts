import useSWR from 'swr';
import { api } from '@/lib/api';
import type {
  DashboardResponse,
  OptionChainWithGreeks,
  PositionAnalysisResponse,
  PositionOut,
} from '@/lib/api';

// Backend already caches stock quotes for 10s — no need to refresh faster
const QUOTE_REFRESH = 15_000;
const CHAIN_REFRESH = 60_000;
const POSITION_REFRESH = 30_000;
const EXPIRY_REFRESH = 600_000; // 10 min — expiry dates rarely change

export function useDashboard() {
  return useSWR<DashboardResponse>('dashboard', () => api.dashboard(), {
    refreshInterval: QUOTE_REFRESH,
    dedupingInterval: 10_000,
  });
}

export function useOptionExpiries(symbol: string) {
  return useSWR(symbol ? `expiries-${symbol}` : null, () => api.optionExpiries(symbol), {
    dedupingInterval: EXPIRY_REFRESH,
    revalidateOnFocus: false,
  });
}

export function useOptionChain(symbol: string, expiry: string) {
  const key = symbol && expiry ? `chain-${symbol}-${expiry}` : null;
  return useSWR<OptionChainWithGreeks>(key, () => api.optionChain(symbol, expiry), {
    refreshInterval: CHAIN_REFRESH,
    dedupingInterval: 30_000,
    errorRetryInterval: 15_000,
    errorRetryCount: 3,
    revalidateOnFocus: false,
  });
}

export function usePositions(status = 'open') {
  return useSWR<PositionOut[]>(`positions-${status}`, () => api.listPositions(status), {
    refreshInterval: POSITION_REFRESH,
    dedupingInterval: 15_000,
    revalidateOnFocus: false,
  });
}

export function usePositionAnalysis() {
  return useSWR<PositionAnalysisResponse>('position-analysis', () => api.analyzePositions(), {
    refreshInterval: POSITION_REFRESH,
    dedupingInterval: 15_000,
    revalidateOnFocus: false,
  });
}
