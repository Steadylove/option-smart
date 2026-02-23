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
import { Progress } from '@/components/ui/progress';
import type {
  AccountRisk,
  PortfolioSummary as PortfolioSummaryType,
  SymbolSummary,
} from '@/lib/api';
import { cn } from '@/lib/utils';

interface PortfolioSummaryProps {
  data: PortfolioSummaryType;
  bySymbol?: SymbolSummary[];
  accountRisk?: AccountRisk | null;
}

const COLOR_PALETTE = [
  'bg-blue-500',
  'bg-red-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-cyan-500',
  'bg-pink-500',
  'bg-amber-500',
];

function symbolColor(sym: string): string {
  let hash = 0;
  for (const c of sym) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

const DIRECTION_LABELS: Record<string, string> = {
  long: 'Long',
  short: 'Short',
};

const RISK_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'Safe', color: 'text-green-400' },
  1: { label: 'Medium', color: 'text-yellow-400' },
  2: { label: 'Warning', color: 'text-orange-400' },
  3: { label: 'Danger', color: 'text-red-400' },
};

function utilizationColor(pct: number) {
  if (pct < 50) return 'text-green-400';
  if (pct < 75) return 'text-yellow-400';
  return 'text-red-400';
}

function progressIndicatorClass(pct: number) {
  if (pct < 50) return '[&>div]:bg-green-500';
  if (pct < 75) return '[&>div]:bg-yellow-500';
  return '[&>div]:bg-red-500';
}

export function PortfolioSummary({ data, bySymbol, accountRisk }: PortfolioSummaryProps) {
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

      {accountRisk &&
        (() => {
          const cash = accountRisk.total_cash ?? 0;
          const safety = accountRisk.margin_safety_pct ?? 0;

          return (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                {t('accountRisk')}
              </p>

              {/* Row 1: core account metrics */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Card className="border-border">
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-muted-foreground">{t('netAssets')}</p>
                    <p className="mt-1 text-xl font-bold text-blue-400">
                      $
                      {accountRisk.net_assets.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {t('totalCash')}: $
                      {cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-muted-foreground">{t('initMargin')}</p>
                    <p className="mt-1 text-xl font-bold">
                      $
                      {accountRisk.init_margin.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {t('maintenance')}: $
                      {accountRisk.maintenance_margin.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-muted-foreground">{t('buyPower')}</p>
                    <p className="mt-1 text-xl font-bold text-green-400">
                      $
                      {accountRisk.buy_power.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-muted-foreground">{t('riskLevel')}</p>
                    <p
                      className={cn(
                        'mt-1 text-xl font-bold',
                        (RISK_LABELS[accountRisk.risk_level] ?? RISK_LABELS[0]).color,
                      )}
                    >
                      {(RISK_LABELS[accountRisk.risk_level] ?? RISK_LABELS[0]).label}
                    </p>
                    {accountRisk.profitable_margin_freeable > 0 && (
                      <p className="mt-0.5 text-[11px] text-green-400">
                        {t('freeableMargin')}: $
                        {accountRisk.profitable_margin_freeable.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Row 2: utilization, financing, safety */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Card className="border-border">
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t('marginUtilization')}
                    </p>
                    <p
                      className={cn(
                        'mt-1 text-xl font-bold',
                        utilizationColor(accountRisk.margin_utilization),
                      )}
                    >
                      {accountRisk.margin_utilization.toFixed(1)}%
                    </p>
                    <Progress
                      value={Math.min(accountRisk.margin_utilization, 100)}
                      className={cn(
                        'mt-2 h-1.5',
                        progressIndicatorClass(accountRisk.margin_utilization),
                      )}
                    />
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-muted-foreground">{t('financeQuota')}</p>
                    <p className="mt-1 text-xl font-bold">
                      $
                      {(accountRisk.max_finance_amount ?? 0).toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {t('financeRemaining')}: $
                      {(accountRisk.remaining_finance_amount ?? 0).toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-muted-foreground">{t('marginSafety')}</p>
                    <p
                      className={cn(
                        'mt-1 text-xl font-bold',
                        safety >= 50
                          ? 'text-green-400'
                          : safety >= 25
                            ? 'text-yellow-400'
                            : 'text-red-400',
                      )}
                    >
                      {safety.toFixed(1)}%
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {t('marginSafetyDesc')}
                    </p>
                  </CardContent>
                </Card>
                <Card
                  className={cn(
                    'border-border',
                    accountRisk.theta_yield_ann > 0 && 'ring-1 ring-primary/20',
                  )}
                >
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-muted-foreground">{t('thetaYield')}</p>
                    <p
                      className={cn(
                        'mt-1 text-xl font-bold',
                        accountRisk.theta_yield_ann >= 20
                          ? 'text-green-400'
                          : accountRisk.theta_yield_ann >= 10
                            ? 'text-yellow-400'
                            : 'text-red-400',
                      )}
                    >
                      {accountRisk.theta_yield_ann.toFixed(1)}%
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {t('thetaYieldDesc')}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          );
        })()}

      {bySymbol && bySymbol.length > 0 && (
        <Card className="border-border">
          <CardContent className="p-4">
            <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
              {t('perSymbolBreakdown')}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="pb-2 text-left font-medium">{t('symbolCol')}</th>
                    <th className="pb-2 text-right font-medium">{t('spotCol')}</th>
                    <th className="pb-2 text-right font-medium">Delta</th>
                    <th className="pb-2 text-right font-medium">Theta</th>
                    <th className="pb-2 text-right font-medium">Vega</th>
                    <th className="pb-2 text-right font-medium">{t('pnlCol')}</th>
                    <th className="pb-2 text-right font-medium">{t('captCol')}</th>
                    <th className="pb-2 text-right font-medium">{t('marginCol')}</th>
                    <th className="pb-2 text-right font-medium">{t('marginAnnCol')}</th>
                    <th className="pb-2 text-right font-medium">{t('riskAnnCol')}</th>
                    <th className="pb-2 text-center font-medium">{t('posCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {bySymbol.map((s) => (
                    <tr key={s.symbol} className="border-b border-border/50 last:border-0">
                      <td className="py-2 font-semibold">{s.symbol}</td>
                      <td className="py-2 text-right font-mono text-muted-foreground">
                        ${s.spot_price.toFixed(2)}
                      </td>
                      <td
                        className={cn(
                          'py-2 text-right font-mono',
                          s.total_delta > 0 ? 'text-green-400' : 'text-red-400',
                        )}
                      >
                        {s.total_delta > 0 ? '+' : ''}
                        {s.total_delta.toFixed(1)}
                      </td>
                      <td
                        className={cn(
                          'py-2 text-right font-mono',
                          s.daily_theta_income > 0 ? 'text-green-400' : 'text-red-400',
                        )}
                      >
                        ${s.daily_theta_income.toFixed(2)}
                      </td>
                      <td className="py-2 text-right font-mono text-purple-400">
                        {s.total_vega.toFixed(1)}
                      </td>
                      <td
                        className={cn(
                          'py-2 text-right font-mono',
                          s.total_unrealized_pnl >= 0 ? 'text-green-400' : 'text-red-400',
                        )}
                      >
                        {s.total_unrealized_pnl >= 0 ? '+' : ''}${s.total_unrealized_pnl.toFixed(2)}
                      </td>
                      <td className="py-2 text-right font-mono text-blue-400">
                        ${s.total_extrinsic_value.toFixed(0)}
                      </td>
                      <td className="py-2 text-right font-mono text-muted-foreground">
                        {s.total_estimated_margin > 0
                          ? `$${s.total_estimated_margin.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                          : '—'}
                      </td>
                      <td
                        className={cn(
                          'py-2 text-right font-mono font-medium',
                          s.margin_return_ann >= 20
                            ? 'text-green-400'
                            : s.margin_return_ann >= 10
                              ? 'text-yellow-400'
                              : s.margin_return_ann > 0
                                ? 'text-red-400'
                                : 'text-muted-foreground',
                        )}
                      >
                        {s.margin_return_ann > 0 ? `${s.margin_return_ann.toFixed(1)}%` : '—'}
                      </td>
                      <td
                        className={cn(
                          'py-2 text-right font-mono font-medium',
                          s.risk_return_ann >= 5
                            ? 'text-green-400'
                            : s.risk_return_ann >= 2
                              ? 'text-yellow-400'
                              : s.risk_return_ann > 0
                                ? 'text-red-400'
                                : 'text-muted-foreground',
                        )}
                      >
                        {s.risk_return_ann > 0 ? `${s.risk_return_ann.toFixed(1)}%` : '—'}
                      </td>
                      <td className="py-2 text-center text-muted-foreground">{s.position_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 space-y-1 border-t border-border/50 pt-3 text-[10px] text-muted-foreground">
              <p>
                <span className="font-medium text-foreground/70">{t('marginAnnCol')}</span>{' '}
                {t('marginAnnDesc')}
              </p>
              <p>
                <span className="font-medium text-foreground/70">{t('riskAnnCol')}</span>{' '}
                {t('riskAnnDesc')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

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
                            symbolColor(sym),
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
