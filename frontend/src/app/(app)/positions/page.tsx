'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Briefcase, Download, Loader2, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorBanner } from '@/components/error-banner';
import { AddPositionDialog } from '@/components/add-position-dialog';
import { PortfolioSummary } from '@/components/portfolio-summary';
import { PositionTable } from '@/components/position-table';
import { PositionsAssistant } from '@/components/positions-assistant';
import { usePositionAnalysis, usePositions } from '@/hooks/use-swr-api';
import { api, type SyncResult } from '@/lib/api';

function PositionsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-border">
            <CardContent className="p-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="mt-2 h-7 w-16" />
              <Skeleton className="mt-1 h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-border">
        <CardContent className="p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="mt-3 h-12 w-full first:mt-0" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PositionsPage() {
  const {
    data: analysis,
    error: analysisError,
    isLoading,
    isValidating,
    mutate: refreshAnalysis,
  } = usePositionAnalysis();

  const { data: closedPositions, mutate: refreshClosed } = usePositions('closed');

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState('');

  const t = useTranslations('positions');
  const tc = useTranslations('common');

  function handleRefresh() {
    refreshAnalysis();
    refreshClosed();
  }

  async function handleSync() {
    setSyncing(true);
    setSyncError('');
    setSyncResult(null);
    try {
      const result = await api.syncPositions();
      setSyncResult(result);
      handleRefresh();
      setTimeout(() => setSyncResult(null), 8000);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Briefcase className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">{t('description')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isValidating && (
            <Badge variant="outline" className="gap-1 border-border text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('updating')}
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing}>
            {syncing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-3.5 w-3.5" />
            )}
            {syncing ? t('syncing') : t('syncFromLongbridge')}
          </Button>
          <AddPositionDialog onCreated={handleRefresh} />
        </div>
      </div>

      {syncResult && (
        <div className="flex items-start gap-3 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
          <div>
            <p className="font-medium text-green-400">
              {t('syncComplete', {
                synced: syncResult.synced,
                updated: syncResult.updated ?? 0,
                closed: syncResult.closed ?? 0,
                skipped: syncResult.skipped,
              })}
            </p>
            {syncResult.details.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                {syncResult.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {syncError && (
        <ErrorBanner message={t('syncError')} detail={syncError} onRetry={handleSync} />
      )}

      {analysisError && (
        <ErrorBanner
          message={t('analysisError')}
          detail={analysisError instanceof Error ? analysisError.message : undefined}
          onRetry={() => refreshAnalysis()}
        />
      )}

      {isLoading && <PositionsSkeleton />}

      {analysis && (
        <Tabs defaultValue="open" className="space-y-4">
          <TabsList>
            <TabsTrigger value="open">
              {t('tabOpen')}
              {analysis.portfolio.total_positions > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                  {analysis.portfolio.total_positions}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="closed">
              {t('tabClosed')}
              {closedPositions && closedPositions.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                  {closedPositions.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="space-y-4">
            <PortfolioSummary
              data={analysis.portfolio}
              bySymbol={analysis.by_symbol}
              accountRisk={analysis.account_risk}
            />

            <div>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase">
                {t('positionDetails')}
              </h2>
              <PositionTable positions={analysis.positions} onRefresh={handleRefresh} />
            </div>
          </TabsContent>

          <TabsContent value="closed">
            {closedPositions && closedPositions.length > 0 ? (
              <Card className="overflow-hidden border-border p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-4 py-3">{t('thContract')}</th>
                      <th className="px-4 py-3 text-right">{t('thOpen')}</th>
                      <th className="px-4 py-3 text-right">{t('thClose')}</th>
                      <th className="px-4 py-3 text-right">{t('thRealizedPnl')}</th>
                      <th className="px-4 py-3 text-center">{t('thDuration')}</th>
                      <th className="px-4 py-3">{t('thStatus')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedPositions.map((p) => {
                      const days =
                        p.close_date && p.open_date
                          ? Math.round(
                              (new Date(p.close_date).getTime() - new Date(p.open_date).getTime()) /
                                86400000,
                            )
                          : '-';
                      return (
                        <tr key={p.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3">
                            <p className="font-medium">
                              {p.symbol.replace('.US', '')} ${p.strike}{' '}
                              {p.option_type?.toUpperCase()}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {p.direction.toUpperCase()} · {p.quantity}{' '}
                              {tc('contracts', { count: p.quantity })}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            ${p.open_price.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            ${p.close_price?.toFixed(2) ?? '-'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {p.realized_pnl !== null ? (
                              <span
                                className={
                                  p.realized_pnl >= 0
                                    ? 'font-mono text-green-400'
                                    : 'font-mono text-red-400'
                                }
                              >
                                {p.realized_pnl >= 0 ? '+' : ''}${p.realized_pnl.toFixed(2)}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-muted-foreground">{days}d</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {p.status}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            ) : (
              <Card className="border-border">
                <CardContent className="flex flex-col items-center py-12 text-center">
                  <p className="text-sm text-muted-foreground">{t('noClosedPositions')}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      <PositionsAssistant analysisData={analysis ?? null} />
    </div>
  );
}
