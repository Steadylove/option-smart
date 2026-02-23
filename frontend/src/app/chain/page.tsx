'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useOptionExpiries, useOptionChain, useSettings } from '@/hooks/use-swr-api';
import { OptionChainTable } from '@/components/option-chain-table';
import { OptionAnalysisDialog } from '@/components/option-analysis-dialog';
import { ChainSkeleton } from '@/components/dashboard-skeleton';
import { ErrorBanner } from '@/components/error-banner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  Target,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
  Circle,
  ChevronsUpDown,
  ChevronsDownUp,
  RefreshCw,
} from 'lucide-react';
import type { OptionWithGreeks } from '@/lib/api';

type ViewMode = 'all' | 'calls' | 'puts';

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export default function ChainPage() {
  const { symbols: SYMBOLS } = useSettings();
  const [symbol, setSymbol] = useState('');
  const [expiry, setExpiry] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOption, setSelectedOption] = useState<OptionWithGreeks | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeSymbol = symbol || SYMBOLS[0] || '';

  const strikes = expanded ? 'all' : 'near';

  const t = useTranslations('chain');
  const tc = useTranslations('common');

  const {
    data: expiries,
    error: expiriesError,
    mutate: retryExpiries,
  } = useOptionExpiries(activeSymbol);
  const {
    data: chain,
    error: chainError,
    isLoading,
    isValidating,
    mutate: mutateChain,
  } = useOptionChain(activeSymbol, expiry, strikes);

  const today = new Date().toISOString().slice(0, 10);
  const futureDates = expiries?.expiry_dates.filter((d) => d > today) ?? [];

  if (futureDates.length && !expiry) {
    setExpiry(futureDates[0]);
  }

  // Reset expanded when switching symbol or expiry
  useEffect(() => {
    setExpanded(false);
  }, [activeSymbol, expiry]);

  useEffect(() => {
    if (scrollRef.current && expiry) {
      const active = scrollRef.current.querySelector('[data-active="true"]');
      active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [expiry]);

  const handleRefresh = useCallback(async () => {
    if (!activeSymbol || !expiry || refreshing) return;
    setRefreshing(true);
    try {
      const fresh = await api.optionChain(activeSymbol, expiry, strikes, true);
      mutateChain(fresh, { revalidate: false });
    } catch {
      mutateChain();
    } finally {
      setRefreshing(false);
    }
  }, [activeSymbol, expiry, strikes, refreshing, mutateChain]);

  const dte = chain?.calls[0]?.dte ?? chain?.puts[0]?.dte ?? null;
  const showingStrikes = Math.max(chain?.calls.length ?? 0, chain?.puts.length ?? 0);

  const viewModes = [
    { key: 'all' as const, label: tc('all'), icon: ArrowUpDown },
    { key: 'calls' as const, label: t('calls'), icon: ArrowUp },
    { key: 'puts' as const, label: t('puts'), icon: ArrowDown },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden p-6 lg:p-8">
      {/* Fixed header controls */}
      <div className="shrink-0 space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
        </div>

        <Tabs
          value={activeSymbol}
          onValueChange={(v) => {
            setSymbol(v);
            setExpiry('');
          }}
        >
          <TabsList>
            {SYMBOLS.map((s) => (
              <TabsTrigger key={s} value={s} className="px-5 font-semibold">
                {s}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {expiriesError && (
          <ErrorBanner
            message={t('expiryError', { symbol: activeSymbol })}
            detail={t('expiryErrorDetail')}
            onRetry={() => retryExpiries()}
          />
        )}

        {futureDates.length > 0 && (
          <ScrollArea className="w-full">
            <div ref={scrollRef} className="flex gap-2 pb-2">
              {futureDates.map((d) => {
                const dte = daysUntil(d);
                const active = d === expiry;
                const isWeekly = dte <= 7;
                return (
                  <button
                    key={d}
                    data-active={active}
                    onClick={() => setExpiry(d)}
                    className={cn(
                      'flex shrink-0 flex-col items-center rounded-lg border px-4 py-2 text-xs transition-all',
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                    )}
                  >
                    <span className="font-semibold tabular-nums">{d.slice(5)}</span>
                    <span
                      className={cn('mt-0.5 tabular-nums', isWeekly && !active && 'text-chart-5')}
                    >
                      {dte}d
                    </span>
                  </button>
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}

        {chainError && !isLoading && (
          <ErrorBanner
            message={t('chainError')}
            detail={t('chainErrorDetail')}
            onRetry={() => mutateChain()}
          />
        )}

        {chain && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1.5 font-mono tabular-nums">
                <Target className="h-3 w-3" />
                {activeSymbol}.US
              </Badge>
              <Badge variant="secondary" className="font-mono tabular-nums">
                Spot ${parseFloat(chain.spot_price).toFixed(2)}
              </Badge>
              {dte !== null && (
                <Badge variant="secondary" className="font-mono tabular-nums">
                  DTE {dte}
                </Badge>
              )}
              <Badge
                variant="outline"
                className={cn(
                  'gap-1 text-[10px]',
                  chain.market_open
                    ? 'border-emerald-500/30 text-emerald-400'
                    : 'border-zinc-500/30 text-zinc-400',
                )}
              >
                <Circle
                  className={cn('h-1.5 w-1.5 fill-current', chain.market_open && 'animate-pulse')}
                />
                {chain.market_open ? t('live') : t('delayed')}
              </Badge>

              {chain.total_strikes > 0 && (
                <Badge
                  variant="outline"
                  className="gap-1 font-mono text-[10px] text-muted-foreground"
                >
                  {t('showingStrikes', { showing: showingStrikes, total: chain.total_strikes })}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {chain.is_truncated && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  disabled={isValidating}
                  onClick={() => setExpanded(true)}
                >
                  <ChevronsUpDown className="h-3.5 w-3.5" />
                  {t('expandAll', { total: chain.total_strikes })}
                </Button>
              )}

              {expanded && !chain.is_truncated && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setExpanded(false)}
                >
                  <ChevronsDownUp className="h-3.5 w-3.5" />
                  {t('collapseToNear')}
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                disabled={refreshing}
                onClick={handleRefresh}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
                {refreshing ? t('refreshing') : t('refresh')}
              </Button>

              <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
                {viewModes.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setViewMode(key)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                      viewMode === key
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table area: fills remaining height, scrolls internally */}
      {isLoading && !chain && (
        <div className="mt-4 min-h-0 flex-1">
          <ChainSkeleton />
        </div>
      )}

      {chain && (
        <div className="relative mt-4 min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card **:data-[slot=table-container]:h-full **:data-[slot=table-container]:overflow-auto">
          {isValidating && (
            <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-center gap-2 bg-primary/10 py-1 text-xs font-medium text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              {tc('loading')}
            </div>
          )}
          <OptionChainTable
            calls={chain.calls}
            puts={chain.puts}
            spotPrice={parseFloat(chain.spot_price)}
            viewMode={viewMode}
            onOptionClick={setSelectedOption}
          />
        </div>
      )}

      <OptionAnalysisDialog
        option={selectedOption}
        spotPrice={chain ? parseFloat(chain.spot_price) : 0}
        symbol={`${activeSymbol}.US`}
        onClose={() => setSelectedOption(null)}
      />
    </div>
  );
}
