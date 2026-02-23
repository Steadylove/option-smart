'use client';

import { useTranslations } from 'next-intl';
import {
  TrendingDown,
  TrendingUp,
  Activity,
  Shield,
  AlertTriangle,
  XCircle,
  DollarSign,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { PortfolioSummary as PortfolioSummaryType } from '@/lib/api';
import { cn } from '@/lib/utils';

interface PortfolioSummaryProps {
  data: PortfolioSummaryType;
}

const SYMBOL_COLORS: Record<string, string> = {
  TQQQ: 'bg-blue-500',
  TSLL: 'bg-red-500',
  NVDL: 'bg-green-500',
};

const DIRECTION_LABELS: Record<string, string> = {
  sell: 'Short',
  buy: 'Long',
  long: 'Long',
};

export function PortfolioSummary({ data }: PortfolioSummaryProps) {
  const t = useTranslations('portfolio');
  const tc = useTranslations('common');

  const metrics = [
    {
      label: t('totalDelta'),
      value: data.total_delta.toFixed(1),
      desc:
        data.total_delta > 0
          ? t('bullishBias')
          : data.total_delta < 0
            ? t('bearishBias')
            : t('neutral'),
      icon: Activity,
      color: Math.abs(data.total_delta) > 100 ? 'text-yellow-400' : 'text-blue-400',
    },
    {
      label: t('dailyTheta'),
      value: `$${data.daily_theta_income.toFixed(2)}`,
      desc: t('estimatedDailyIncome'),
      icon: TrendingUp,
      color: data.daily_theta_income > 0 ? 'text-green-400' : 'text-red-400',
    },
    {
      label: t('totalVega'),
      value: data.total_vega.toFixed(1),
      desc: t('ivSensitivity'),
      icon: TrendingDown,
      color: 'text-purple-400',
    },
    {
      label: t('unrealizedPnl'),
      value: `${data.total_unrealized_pnl >= 0 ? '+' : ''}$${data.total_unrealized_pnl.toFixed(2)}`,
      desc: t('allOpenPositions'),
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

        <Card className="border-border">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <DollarSign className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <p className="text-lg font-bold text-blue-400">
                ${data.total_extrinsic_value.toFixed(0)}
              </p>
              <p className="text-[11px] text-muted-foreground">{t('capturableValue')}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {data.concentration && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground">
                {t('symbolConcentration')}
              </p>
              <div className="mt-3 space-y-2">
                {Object.entries(data.concentration.by_symbol)
                  .sort((a, b) => b[1] - a[1])
                  .map(([sym, pct]) => (
                    <div key={sym} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium">{sym}</span>
                        <span className="text-muted-foreground">{pct}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-1.5 rounded-full',
                            SYMBOL_COLORS[sym] || 'bg-primary',
                            pct > 60 && 'opacity-100',
                          )}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                {Object.keys(data.concentration.by_symbol).length === 0 && (
                  <p className="text-xs text-muted-foreground">{t('noPositions')}</p>
                )}
                {Object.values(data.concentration.by_symbol).some((v) => v > 60) && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-md bg-yellow-500/10 px-2 py-1.5">
                    <AlertTriangle className="h-3 w-3 text-yellow-400" />
                    <span className="text-[10px] text-yellow-400">{t('highConcentration')}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground">
                {t('directionDistribution')}
              </p>
              <div className="mt-3 space-y-2">
                {Object.entries(data.concentration.by_direction).map(([dir, count]) => {
                  const total = Object.values(data.concentration!.by_direction).reduce(
                    (a, b) => a + b,
                    0,
                  );
                  const pct = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <div key={dir} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium">{DIRECTION_LABELS[dir] || dir}</span>
                        <span className="text-muted-foreground">
                          {count} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-1.5 rounded-full',
                            dir === 'sell' ? 'bg-orange-500' : 'bg-emerald-500',
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                  {t('byStrategy')}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {Object.entries(data.positions_by_strategy).map(([strat, count]) => (
                    <span
                      key={strat}
                      className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase text-primary"
                    >
                      {strat} ×{count}
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground">{t('expiryDistribution')}</p>
              <div className="mt-3 space-y-2">
                {Object.entries(data.concentration.by_expiry_week)
                  .sort()
                  .map(([week, count]) => {
                    const total = Object.values(data.concentration!.by_expiry_week).reduce(
                      (a, b) => a + b,
                      0,
                    );
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    return (
                      <div key={week} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium">{week}</span>
                          <span className="text-muted-foreground">
                            {count} {tc('positions', { count })}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted">
                          <div
                            className="h-1.5 rounded-full bg-violet-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                {Object.keys(data.concentration.by_expiry_week).length === 0 && (
                  <p className="text-xs text-muted-foreground">{t('noDatedPositions')}</p>
                )}
                {Object.values(data.concentration.by_expiry_week).some(
                  (v) => v >= 3 && data.total_positions > 3,
                ) && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-md bg-yellow-500/10 px-2 py-1.5">
                    <AlertTriangle className="h-3 w-3 text-yellow-400" />
                    <span className="text-[10px] text-yellow-400">{t('multipleExpiring')}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
