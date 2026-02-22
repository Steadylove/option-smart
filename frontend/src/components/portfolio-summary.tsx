'use client';

import { TrendingDown, TrendingUp, Activity, Shield, AlertTriangle, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { PortfolioSummary as PortfolioSummaryType } from '@/lib/api';
import { cn } from '@/lib/utils';

interface PortfolioSummaryProps {
  data: PortfolioSummaryType;
}

export function PortfolioSummary({ data }: PortfolioSummaryProps) {
  const metrics = [
    {
      label: 'Total Delta',
      value: data.total_delta.toFixed(1),
      desc:
        data.total_delta > 0 ? 'Bullish bias' : data.total_delta < 0 ? 'Bearish bias' : 'Neutral',
      icon: Activity,
      color: Math.abs(data.total_delta) > 100 ? 'text-yellow-400' : 'text-blue-400',
    },
    {
      label: 'Daily Theta',
      value: `$${data.daily_theta_income.toFixed(2)}`,
      desc: 'Estimated daily income',
      icon: TrendingUp,
      color: data.daily_theta_income > 0 ? 'text-green-400' : 'text-red-400',
    },
    {
      label: 'Total Vega',
      value: data.total_vega.toFixed(1),
      desc: 'IV sensitivity',
      icon: TrendingDown,
      color: 'text-purple-400',
    },
    {
      label: 'Unrealized P&L',
      value: `${data.total_unrealized_pnl >= 0 ? '+' : ''}$${data.total_unrealized_pnl.toFixed(2)}`,
      desc: 'All open positions',
      icon: data.total_unrealized_pnl >= 0 ? TrendingUp : TrendingDown,
      color: data.total_unrealized_pnl >= 0 ? 'text-green-400' : 'text-red-400',
    },
  ];

  const healthIcons = {
    safe: { icon: Shield, color: 'text-green-400', bg: 'bg-green-500/10' },
    warning: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    danger: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
  };

  return (
    <div className="space-y-4">
      {/* Greeks & P&L metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label} className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">{m.label}</p>
                <m.icon className={cn('h-4 w-4', m.color)} />
              </div>
              <p className={cn('mt-1 text-xl font-bold', m.color)}>{m.value}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{m.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Health & distribution */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Health counts */}
        {(['safe', 'warning', 'danger'] as const).map((level) => {
          const h = healthIcons[level];
          const count = data.health_counts[level] ?? 0;
          return (
            <Card key={level} className="border-border">
              <CardContent className="flex items-center gap-3 p-4">
                <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', h.bg)}>
                  <h.icon className={cn('h-4 w-4', h.color)} />
                </div>
                <div>
                  <p className="text-lg font-bold">{count}</p>
                  <p className="text-[11px] capitalize text-muted-foreground">{level}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Symbol distribution */}
        <Card className="border-border">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">By Symbol</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(data.positions_by_symbol).map(([sym, count]) => (
                <span
                  key={sym}
                  className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                >
                  {sym} ×{count}
                </span>
              ))}
              {Object.keys(data.positions_by_symbol).length === 0 && (
                <span className="text-xs text-muted-foreground">No positions</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
