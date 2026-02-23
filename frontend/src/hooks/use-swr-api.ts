import useSWR from 'swr';
import { api } from '@/lib/api';
import type {
  AlertsResponse,
  DashboardResponse,
  EventTimelineResponse,
  MarketNewsResponse,
  OptionChainWithGreeks,
  PositionAnalysisResponse,
  PositionOut,
  SettingsResponse,
  UpcomingEventsResponse,
} from '@/lib/api';

// Backend already caches stock quotes for 10s — no need to refresh faster
const QUOTE_REFRESH = 15_000;
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

export function useOptionChain(symbol: string, expiry: string, strikes: 'near' | 'all' = 'near') {
  const key = symbol && expiry ? `chain-${symbol}-${expiry}-${strikes}` : null;
  return useSWR<OptionChainWithGreeks>(key, () => api.optionChain(symbol, expiry, strikes), {
    dedupingInterval: 60_000,
    revalidateOnFocus: false,
    keepPreviousData: true,
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

const ALERT_REFRESH = 60_000; // 1 min — alerts don't need sub-minute refresh

export function useAlerts() {
  return useSWR<AlertsResponse>('alerts', () => api.getAlerts(), {
    refreshInterval: ALERT_REFRESH,
    dedupingInterval: 30_000,
    revalidateOnFocus: false,
  });
}

const EVENT_REFRESH = 300_000; // 5 min

export function useUpcomingEvents(days = 14) {
  return useSWR<UpcomingEventsResponse>(
    `events-upcoming-${days}`,
    () => api.getUpcomingEvents(days),
    {
      refreshInterval: EVENT_REFRESH,
      dedupingInterval: 60_000,
      revalidateOnFocus: false,
    },
  );
}

export function useEventTimeline(daysBack = 7, daysAhead = 14) {
  return useSWR<EventTimelineResponse>(
    `events-timeline-${daysBack}-${daysAhead}`,
    () => api.getEventTimeline(daysBack, daysAhead),
    {
      refreshInterval: EVENT_REFRESH,
      dedupingInterval: 60_000,
      revalidateOnFocus: false,
    },
  );
}

export function useMarketNews(symbol = '', days = 7) {
  return useSWR<MarketNewsResponse>(
    `events-news-${symbol}-${days}`,
    () => api.getMarketNews(symbol, days),
    {
      refreshInterval: EVENT_REFRESH,
      dedupingInterval: 60_000,
      revalidateOnFocus: false,
    },
  );
}

const DEFAULT_SYMBOLS = ['TQQQ.US', 'TSLL.US', 'NVDL.US'];

export function useSettings() {
  const { data, ...rest } = useSWR<SettingsResponse>('settings', () => api.getSettings(), {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  const watchedSymbols = data?.watched_symbols ?? DEFAULT_SYMBOLS;

  return {
    ...rest,
    data,
    watchedSymbols,
    symbols: watchedSymbols.map((s) => s.replace('.US', '')),
  };
}
