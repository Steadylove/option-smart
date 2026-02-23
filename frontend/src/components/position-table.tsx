'use client';

import { Fragment, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Trash2,
  ChevronDown,
  ChevronRight,
  Shield,
  AlertTriangle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Clock,
  Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { api, type PositionDiagnosis, type DecisionMatrixResponse } from '@/lib/api';

const HEALTH_CONFIG = {
  safe: {
    icon: Shield,
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
  },
  danger: {
    icon: XCircle,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
  },
};

const STRATEGY_LABELS: Record<string, string> = {
  csp: 'CSP',
  cc: 'CC',
  bull_put_spread: 'Bull Put',
  bear_call_spread: 'Bear Call',
  iron_condor: 'IC',
  strangle: 'Strangle',
  stock: 'Stock',
  custom: 'Custom',
};

interface PositionTableProps {
  positions: PositionDiagnosis[];
  onRefresh: () => void;
}

export function PositionTable({ positions, onRefresh }: PositionTableProps) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [decisions, setDecisions] = useState<DecisionMatrixResponse | null>(null);
  const [decisionsLoading, setDecisionsLoading] = useState(false);

  const t = useTranslations('positionTable');
  const tc = useTranslations('common');

  async function handleDelete() {
    if (deleteId === null) return;
    setLoading(true);
    try {
      await api.deletePosition(deleteId);
      setDeleteId(null);
      onRefresh();
    } finally {
      setLoading(false);
    }
  }

  async function loadDecisions(positionId: number) {
    setDecisionsLoading(true);
    setDecisions(null);
    try {
      const res = await api.getDecisions(positionId);
      setDecisions(res);
    } catch {
      setDecisions(null);
    } finally {
      setDecisionsLoading(false);
    }
  }

  function handleExpand(id: number) {
    if (expanded === id) {
      setExpanded(null);
      setDecisions(null);
    } else {
      setExpanded(id);
      loadDecisions(id);
    }
  }

  if (positions.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <Clock className="h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-sm font-medium text-muted-foreground">{t('noPositions')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden border-border p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-8" />
              <TableHead>{t('thContract')}</TableHead>
              <TableHead className="text-center">{t('thHealth')}</TableHead>
              <TableHead className="text-right">{t('thStrike')}</TableHead>
              <TableHead className="text-right">{t('thOpen')}</TableHead>
              <TableHead className="text-right">{t('thCurrent')}</TableHead>
              <TableHead className="text-right">{t('thPnl')}</TableHead>
              <TableHead className="text-center">{t('thDte')}</TableHead>
              <TableHead className="text-center">{t('thDelta')}</TableHead>
              <TableHead className="text-center">{t('thThetaDay')}</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((d) => {
              const p = d.position;
              const isOption = p.position_type === 'option';
              const h = HEALTH_CONFIG[d.health.level];
              const HealthIcon = h.icon;
              const isExpanded = expanded === p.id;
              const pnlPositive = d.pnl.unrealized_pnl >= 0;

              return (
                <Fragment key={p.id}>
                  <TableRow
                    className={cn('border-border transition-colors', isExpanded && 'bg-muted/30')}
                  >
                    <TableCell className="px-2">
                      <button
                        onClick={() => handleExpand(p.id)}
                        className="rounded p-0.5 hover:bg-accent"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] font-bold',
                            p.direction === 'sell'
                              ? 'border-orange-500/40 text-orange-400'
                              : p.direction === 'long'
                                ? 'border-emerald-500/40 text-emerald-400'
                                : 'border-blue-500/40 text-blue-400',
                          )}
                        >
                          {p.direction.toUpperCase()}
                        </Badge>
                        <div>
                          {isOption ? (
                            <p className="text-sm font-medium">
                              {p.symbol.replace('.US', '')} ${p.strike}{' '}
                              <span
                                className={
                                  p.option_type === 'put' ? 'text-red-400' : 'text-green-400'
                                }
                              >
                                {p.option_type?.toUpperCase()}
                              </span>
                            </p>
                          ) : (
                            <p className="text-sm font-medium">
                              {p.symbol.replace('.US', '')}{' '}
                              <span className="text-xs text-muted-foreground">Stock</span>
                            </p>
                          )}
                          <p className="text-[11px] text-muted-foreground">
                            {STRATEGY_LABELS[p.strategy] ?? p.strategy} · {p.quantity}{' '}
                            {isOption
                              ? tc('contracts', { count: p.quantity })
                              : tc('shares', { count: p.quantity })}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div
                        className={cn(
                          'mx-auto flex w-fit items-center gap-1.5 rounded-md px-2 py-1',
                          h.bg,
                        )}
                      >
                        <HealthIcon className={cn('h-3.5 w-3.5', h.color)} />
                        <span className={cn('text-xs font-bold', h.color)}>{d.health.score}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {isOption && p.strike != null ? `$${p.strike.toFixed(2)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      ${p.open_price.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      ${d.pnl.current_price.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {pnlPositive ? (
                          <TrendingUp className="h-3.5 w-3.5 text-green-400" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                        )}
                        <span
                          className={cn(
                            'font-mono text-sm font-medium',
                            pnlPositive ? 'text-green-400' : 'text-red-400',
                          )}
                        >
                          {pnlPositive ? '+' : ''}${d.pnl.unrealized_pnl.toFixed(0)}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {pnlPositive ? '+' : ''}
                        {d.pnl.unrealized_pnl_pct.toFixed(1)}%
                      </p>
                    </TableCell>
                    <TableCell className="text-center">
                      {isOption ? (
                        <span
                          className={cn(
                            'font-mono text-sm font-medium',
                            d.dte <= 7 ? 'text-red-400' : d.dte <= 14 ? 'text-yellow-400' : '',
                          )}
                        >
                          {d.dte}d
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm">
                      {d.greeks.delta.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={cn(
                          'font-mono text-sm',
                          d.theta_per_day > 0 ? 'text-green-400' : 'text-red-400',
                        )}
                      >
                        ${Math.abs(d.theta_per_day).toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="px-2">
                      <button
                        onClick={() => setDeleteId(p.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>

                  {isExpanded && (
                    <TableRow className="border-border bg-muted/20 hover:bg-muted/20">
                      <TableCell colSpan={11} className="p-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase text-muted-foreground">
                              {t('diagnosis')}
                            </p>
                            <div className="space-y-1.5">
                              <DetailRow label={t('status')}>
                                <Badge
                                  variant="outline"
                                  className={cn('text-[10px]', h.border, h.color)}
                                >
                                  {d.health.zone}
                                </Badge>
                              </DetailRow>
                              <DetailRow label={t('spotPrice')}>
                                <span className="font-mono">${d.current_spot.toFixed(2)}</span>
                              </DetailRow>
                              {isOption && (
                                <>
                                  <DetailRow label={t('moneyness')}>
                                    <span className="font-medium">{d.moneyness}</span>
                                  </DetailRow>
                                  <DetailRow label={t('iv')}>
                                    <span className="font-mono">
                                      {(d.current_iv * 100).toFixed(1)}%
                                    </span>
                                  </DetailRow>
                                  <DetailRow label={t('assignmentProb')}>
                                    <span className="font-mono">
                                      {d.assignment_prob.toFixed(1)}%
                                    </span>
                                  </DetailRow>
                                  <DetailRow label={t('profitProb')}>
                                    <span className="font-mono">{d.pop.toFixed(1)}%</span>
                                  </DetailRow>
                                </>
                              )}
                              {!isOption && (
                                <DetailRow label={t('costBasis')}>
                                  <span className="font-mono">${d.pnl.cost_value.toFixed(2)}</span>
                                </DetailRow>
                              )}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase text-muted-foreground">
                              {t('positionGreeks')}
                            </p>
                            <div className="space-y-1.5">
                              <DetailRow label={t('delta')}>
                                <span className="font-mono">{d.greeks.delta.toFixed(2)}</span>
                              </DetailRow>
                              {isOption && (
                                <>
                                  <DetailRow label={t('gamma')}>
                                    <span className="font-mono">{d.greeks.gamma.toFixed(4)}</span>
                                  </DetailRow>
                                  <DetailRow label={t('theta')}>
                                    <span className="font-mono">
                                      ${d.greeks.theta.toFixed(2)}/day
                                    </span>
                                  </DetailRow>
                                  <DetailRow label={t('vega')}>
                                    <span className="font-mono">{d.greeks.vega.toFixed(2)}</span>
                                  </DetailRow>
                                </>
                              )}
                              <DetailRow label={t('marketValue')}>
                                <span className="font-mono">${d.pnl.market_value.toFixed(2)}</span>
                              </DetailRow>
                              <DetailRow label={t('unrealizedPnl')}>
                                <span
                                  className={cn(
                                    'font-mono',
                                    pnlPositive ? 'text-green-400' : 'text-red-400',
                                  )}
                                >
                                  {pnlPositive ? '+' : ''}${d.pnl.unrealized_pnl.toFixed(2)}
                                </span>
                              </DetailRow>
                            </div>
                          </div>

                          {isOption && d.time_value && d.attribution && (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold uppercase text-muted-foreground">
                                {t('timeValueSensitivity')}
                              </p>
                              <div className="space-y-1.5">
                                <DetailRow label={t('intrinsic')}>
                                  <span className="font-mono">
                                    ${d.time_value.intrinsic_value.toFixed(2)}
                                  </span>
                                </DetailRow>
                                <DetailRow label={t('extrinsic')}>
                                  <span className="font-mono">
                                    ${d.time_value.extrinsic_value.toFixed(2)}
                                  </span>
                                </DetailRow>
                                <DetailRow label={t('timeValuePct')}>
                                  <span className="font-mono">
                                    {d.time_value.time_value_pct.toFixed(0)}%
                                  </span>
                                </DetailRow>
                                <div className="pt-1">
                                  <div className="h-1.5 w-full rounded-full bg-muted">
                                    <div
                                      className="h-1.5 rounded-full bg-primary"
                                      style={{
                                        width: `${Math.min(d.time_value.time_value_pct, 100)}%`,
                                      }}
                                    />
                                  </div>
                                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                                    <span>{t('intrinsic')}</span>
                                    <span>{t('timeValue')}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="mt-3 space-y-1">
                                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                                  {t('impactPer1Pct')}
                                </p>
                                <ImpactBar
                                  label={t('deltaSpot')}
                                  value={d.attribution.delta_impact_1pct}
                                />
                                <ImpactBar
                                  label={t('vegaIv')}
                                  value={d.attribution.vega_impact_1pct}
                                />
                                <ImpactBar
                                  label={t('theta1Day')}
                                  value={d.attribution.theta_daily}
                                />
                              </div>
                            </div>
                          )}

                          <div className="space-y-3">
                            <p className="text-xs font-semibold uppercase text-muted-foreground">
                              {t('recommendation')}
                            </p>
                            <p className="text-sm leading-relaxed text-foreground/90">
                              {d.action_hint}
                            </p>
                            {isOption && d.time_value && (
                              <div className="rounded-md bg-muted/50 p-3">
                                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                                  {t('thetaProjection')}
                                </p>
                                <div className="mt-1.5 space-y-1">
                                  <DetailRow label={t('next7Days')}>
                                    <span
                                      className={cn(
                                        'font-mono',
                                        d.time_value.theta_7d_projected > 0
                                          ? 'text-green-400'
                                          : 'text-red-400',
                                      )}
                                    >
                                      ${d.time_value.theta_7d_projected.toFixed(2)}
                                    </span>
                                  </DetailRow>
                                  <DetailRow label={t('toExpiry')}>
                                    <span
                                      className={cn(
                                        'font-mono',
                                        d.time_value.theta_to_expiry_projected > 0
                                          ? 'text-green-400'
                                          : 'text-red-400',
                                      )}
                                    >
                                      ${d.time_value.theta_to_expiry_projected.toFixed(2)}
                                    </span>
                                  </DetailRow>
                                  <DetailRow label={t('capturable')}>
                                    <span className="font-mono text-blue-400">
                                      ${d.time_value.total_extrinsic.toFixed(2)}
                                    </span>
                                  </DetailRow>
                                </div>
                              </div>
                            )}
                            <div className="space-y-1 text-[11px] text-muted-foreground">
                              <p>
                                {t('opened')} {p.open_date}
                              </p>
                              {p.expiry && (
                                <p>
                                  {t('expires')} {p.expiry}
                                </p>
                              )}
                              {p.notes && (
                                <p>
                                  {t('note')} {p.notes}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        {isOption && (
                          <div className="col-span-full mt-2 border-t border-border pt-4">
                            <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
                              {t('actionAlternatives')}
                            </p>
                            {decisionsLoading && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                {t('loadingDecisions')}
                              </div>
                            )}
                            {decisions && decisions.position_id === p.id && (
                              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                {decisions.actions.map((action) => (
                                  <div
                                    key={action.action}
                                    className={cn(
                                      'rounded-lg border p-3',
                                      action.score >= 70
                                        ? 'border-green-500/30 bg-green-500/5'
                                        : action.score >= 50
                                          ? 'border-border bg-muted/30'
                                          : 'border-border bg-background',
                                    )}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-semibold">{action.action}</span>
                                      <span
                                        className={cn(
                                          'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                                          action.score >= 70
                                            ? 'bg-green-500/20 text-green-400'
                                            : action.score >= 50
                                              ? 'bg-yellow-500/20 text-yellow-400'
                                              : 'bg-muted text-muted-foreground',
                                        )}
                                      >
                                        {action.score}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-[10px] text-muted-foreground">
                                      {action.description}
                                    </p>
                                    <div className="mt-2 space-y-1">
                                      <div className="flex justify-between text-[10px]">
                                        <span className="text-muted-foreground">
                                          {t('expectedPnl')}
                                        </span>
                                        <span
                                          className={cn(
                                            'font-mono font-medium',
                                            action.expected_pnl >= 0
                                              ? 'text-green-400'
                                              : 'text-red-400',
                                          )}
                                        >
                                          {action.expected_pnl >= 0 ? '+' : ''}$
                                          {action.expected_pnl.toFixed(0)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between text-[10px]">
                                        <span className="text-muted-foreground">
                                          {t('popLabel')}
                                        </span>
                                        <span className="font-mono">{action.pop.toFixed(0)}%</span>
                                      </div>
                                      {action.net_credit !== null && (
                                        <div className="flex justify-between text-[10px]">
                                          <span className="text-muted-foreground">
                                            {t('netCredit')}
                                          </span>
                                          <span
                                            className={cn(
                                              'font-mono',
                                              action.net_credit >= 0
                                                ? 'text-green-400'
                                                : 'text-red-400',
                                            )}
                                          >
                                            ${action.net_credit.toFixed(2)}
                                          </span>
                                        </div>
                                      )}
                                      {action.margin_freed > 0 && (
                                        <div className="flex justify-between text-[10px]">
                                          <span className="text-muted-foreground">
                                            {t('marginFree')}
                                          </span>
                                          <span className="font-mono text-blue-400">
                                            ${action.margin_freed.toFixed(0)}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                    <p className="mt-2 text-[9px] leading-relaxed text-muted-foreground">
                                      {action.risk}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                            {!decisionsLoading &&
                              (!decisions || decisions.position_id !== p.id) && (
                                <p className="text-xs text-muted-foreground">
                                  {t('unableToLoadDecisions')}
                                </p>
                              )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('deletePosition')}</DialogTitle>
            <DialogDescription>{t('deleteConfirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              {tc('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? tc('deleting') : tc('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function ImpactBar({ label, value }: { label: string; value: number }) {
  const maxWidth = 60;
  const absValue = Math.abs(value);
  const width = Math.min(absValue / 10, 1) * maxWidth;
  const isPositive = value >= 0;

  return (
    <div className="flex items-center gap-2">
      <span className="w-24 text-[10px] text-muted-foreground">{label}</span>
      <div className="flex flex-1 items-center gap-1">
        <div
          className={cn('h-1.5 rounded-full', isPositive ? 'bg-green-500/60' : 'bg-red-500/60')}
          style={{ width: `${Math.max(width, 2)}%` }}
        />
        <span
          className={cn('font-mono text-[10px]', isPositive ? 'text-green-400' : 'text-red-400')}
        >
          {isPositive ? '+' : ''}${value.toFixed(0)}
        </span>
      </div>
    </div>
  );
}
