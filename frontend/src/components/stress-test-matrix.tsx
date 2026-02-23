'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { StressScenarioResult } from '@/lib/api';

interface StressTestMatrixProps {
  results: StressScenarioResult[];
  currentPnl: number;
}

function pnlColor(value: number) {
  if (value > 0) return 'text-green-400';
  if (value < 0) return 'text-red-400';
  return 'text-muted-foreground';
}

function pnlBg(value: number, intensity: number) {
  const abs = Math.abs(intensity);
  if (abs < 0.05) return '';
  if (value > 0) return abs > 0.3 ? 'bg-green-500/15' : 'bg-green-500/8';
  return abs > 0.3 ? 'bg-red-500/15' : 'bg-red-500/8';
}

function formatPnl(value: number) {
  const sign = value >= 0 ? '+' : '';
  if (Math.abs(value) >= 1000) return `${sign}$${(value / 1000).toFixed(1)}k`;
  return `${sign}$${value.toFixed(0)}`;
}

export function StressTestMatrix({ results }: StressTestMatrixProps) {
  const t = useTranslations('risk');

  if (results.length === 0) return null;

  const positions = results[0].positions;
  const maxAbsChange = Math.max(...results.map((r) => Math.abs(r.portfolio_pnl_change)), 1);

  return (
    <Card className="overflow-x-auto border-border p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="sticky left-0 z-10 bg-card px-4 py-3">{t('thPosition')}</th>
            {results.map((r) => (
              <th key={r.scenario.name} className="min-w-[100px] px-3 py-3 text-center">
                {r.scenario.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((pos, pi) => (
            <tr key={pos.position_id} className="border-b border-border last:border-0">
              <td className="sticky left-0 z-10 bg-card px-4 py-2.5">
                <p className="text-xs font-medium">{pos.label}</p>
              </td>
              {results.map((r) => {
                const pr = r.positions[pi];
                const change = pr.pnl_change;
                const intensity = maxAbsChange > 0 ? change / maxAbsChange : 0;
                return (
                  <td
                    key={r.scenario.name}
                    className={cn('px-3 py-2.5 text-center', pnlBg(change, intensity))}
                  >
                    <span className={cn('font-mono text-xs font-medium', pnlColor(change))}>
                      {formatPnl(change)}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}

          <tr className="border-t-2 border-border bg-muted/30 font-semibold">
            <td className="sticky left-0 z-10 bg-muted/30 px-4 py-3 text-xs">
              {t('portfolioTotal')}
            </td>
            {results.map((r) => {
              const change = r.portfolio_pnl_change;
              const intensity = maxAbsChange > 0 ? change / maxAbsChange : 0;
              return (
                <td
                  key={r.scenario.name}
                  className={cn('px-3 py-3 text-center', pnlBg(change, intensity))}
                >
                  <span className={cn('font-mono text-sm', pnlColor(change))}>
                    {formatPnl(change)}
                  </span>
                  <p className={cn('mt-0.5 font-mono text-[10px]', pnlColor(r.portfolio_pnl))}>
                    {formatPnl(r.portfolio_pnl)} {t('total')}
                  </p>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </Card>
  );
}
