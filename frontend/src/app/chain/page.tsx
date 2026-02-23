'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useOptionExpiries, useOptionChain } from '@/hooks/use-swr-api';
import { OptionChainTable } from '@/components/option-chain-table';
import { ChainSkeleton } from '@/components/dashboard-skeleton';
import { ErrorBanner } from '@/components/error-banner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Target, ArrowUpDown, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';

const SYMBOLS = ['TQQQ', 'TSLL', 'NVDL'];

type ViewMode = 'all' | 'calls' | 'puts';

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export default function ChainPage() {
  const [symbol, setSymbol] = useState(SYMBOLS[0]);
  const [expiry, setExpiry] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  const t = useTranslations('chain');
  const tc = useTranslations('common');

  const { data: expiries, error: expiriesError, mutate: retryExpiries } = useOptionExpiries(symbol);
  const {
    data: chain,
    error: chainError,
    isLoading,
    isValidating,
    mutate: retryChain,
  } = useOptionChain(symbol, expiry);

  const today = new Date().toISOString().slice(0, 10);
  const futureDates = expiries?.expiry_dates.filter((d) => d > today) ?? [];

  if (futureDates.length && !expiry) {
    setExpiry(futureDates[0]);
  }

  useEffect(() => {
    if (scrollRef.current && expiry) {
      const active = scrollRef.current.querySelector('[data-active="true"]');
      active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [expiry]);

  const dte = chain?.calls[0]?.dte ?? chain?.puts[0]?.dte ?? null;

  const viewModes = [
    { key: 'all' as const, label: tc('all'), icon: ArrowUpDown },
    { key: 'calls' as const, label: t('calls'), icon: ArrowUp },
    { key: 'puts' as const, label: t('puts'), icon: ArrowDown },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <Tabs
        value={symbol}
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
          message={t('expiryError', { symbol })}
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
          onRetry={() => retryChain()}
        />
      )}

      {chain && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5 font-mono tabular-nums">
              <Target className="h-3 w-3" />
              {symbol}.US
            </Badge>
            <Badge variant="secondary" className="font-mono tabular-nums">
              Spot ${parseFloat(chain.spot_price).toFixed(2)}
            </Badge>
            {dte !== null && (
              <Badge variant="secondary" className="font-mono tabular-nums">
                DTE {dte}
              </Badge>
            )}
          </div>

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
      )}

      {isLoading && !chain && <ChainSkeleton />}

      {chain && (
        <Card className="relative overflow-hidden border-border p-0">
          {isValidating && (
            <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 bg-primary/10 py-1 text-xs font-medium text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              {tc('loading')}
            </div>
          )}
          <CardContent className="p-0">
            <OptionChainTable
              calls={chain.calls}
              puts={chain.puts}
              spotPrice={parseFloat(chain.spot_price)}
              viewMode={viewMode}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
