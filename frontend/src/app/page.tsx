'use client';

import { useTranslations } from 'next-intl';
import { useDashboard } from '@/hooks/use-swr-api';
import { useClock } from '@/hooks/use-clock';
import { SymbolCard } from '@/components/symbol-card';
import { DashboardSkeleton } from '@/components/dashboard-skeleton';
import { ErrorBanner } from '@/components/error-banner';
import { Badge } from '@/components/ui/badge';
import { Clock, Radio } from 'lucide-react';

export default function DashboardPage() {
  const { data, error, isLoading, mutate } = useDashboard();
  const now = useClock();
  const t = useTranslations('dashboard');

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6 lg:p-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <Badge variant="secondary" className="gap-1.5 tabular-nums">
              <Radio className="h-3 w-3 animate-pulse text-chart-2" />
              5s
            </Badge>
          )}
          <Badge variant="outline" className="gap-1.5 tabular-nums" suppressHydrationWarning>
            <Clock className="h-3 w-3" />
            {now || '--:--:--'}
          </Badge>
        </div>
      </div>

      {error && (
        <ErrorBanner
          message={t('errorMessage')}
          detail={t('errorDetail')}
          onRetry={() => mutate()}
        />
      )}

      {isLoading ? (
        <DashboardSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data?.symbols.map((s) => (
            <SymbolCard key={s.quote.symbol} data={s} />
          ))}
        </div>
      )}
    </div>
  );
}
