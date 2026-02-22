'use client';

import { Fragment, useState } from 'react';
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
import { api, type PositionDiagnosis } from '@/lib/api';

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

  if (positions.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <Clock className="h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-sm font-medium text-muted-foreground">
            No open positions yet. Add one to get started.
          </p>
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
              <TableHead>Contract</TableHead>
              <TableHead className="text-center">Health</TableHead>
              <TableHead className="text-right">Strike</TableHead>
              <TableHead className="text-right">Open</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">P&L</TableHead>
              <TableHead className="text-center">DTE</TableHead>
              <TableHead className="text-center">Delta</TableHead>
              <TableHead className="text-center">Theta/Day</TableHead>
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
                        onClick={() => setExpanded(isExpanded ? null : p.id)}
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
                              ? `contract${p.quantity > 1 ? 's' : ''}`
                              : `share${p.quantity > 1 ? 's' : ''}`}
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

                  {/* Expanded detail row */}
                  {isExpanded && (
                    <TableRow className="border-border bg-muted/20 hover:bg-muted/20">
                      <TableCell colSpan={11} className="p-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          {/* Diagnosis */}
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase text-muted-foreground">
                              Diagnosis
                            </p>
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Status</span>
                                <Badge
                                  variant="outline"
                                  className={cn('text-[10px]', h.border, h.color)}
                                >
                                  {d.health.zone}
                                </Badge>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Type</span>
                                <span className="font-medium capitalize">{p.position_type}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Spot Price</span>
                                <span className="font-mono">${d.current_spot.toFixed(2)}</span>
                              </div>
                              {isOption && (
                                <>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Moneyness</span>
                                    <span className="font-medium">{d.moneyness}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Assignment Prob</span>
                                    <span className="font-mono">
                                      {d.assignment_prob.toFixed(1)}%
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Profit Prob</span>
                                    <span className="font-mono">{d.pop.toFixed(1)}%</span>
                                  </div>
                                </>
                              )}
                              {!isOption && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Cost Basis</span>
                                  <span className="font-mono">${d.pnl.cost_value.toFixed(2)}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Full Greeks / P&L detail */}
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase text-muted-foreground">
                              {isOption ? 'Position Greeks' : 'Position Detail'}
                            </p>
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Delta</span>
                                <span className="font-mono">{d.greeks.delta.toFixed(2)}</span>
                              </div>
                              {isOption && (
                                <>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Gamma</span>
                                    <span className="font-mono">{d.greeks.gamma.toFixed(4)}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Theta</span>
                                    <span className="font-mono">
                                      ${d.greeks.theta.toFixed(2)}/day
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Vega</span>
                                    <span className="font-mono">{d.greeks.vega.toFixed(2)}</span>
                                  </div>
                                </>
                              )}
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Market Value</span>
                                <span className="font-mono">${d.pnl.market_value.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Unrealized P&L</span>
                                <span
                                  className={cn(
                                    'font-mono',
                                    pnlPositive ? 'text-green-400' : 'text-red-400',
                                  )}
                                >
                                  {pnlPositive ? '+' : ''}${d.pnl.unrealized_pnl.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Action hint */}
                          <div className="space-y-3">
                            <p className="text-xs font-semibold uppercase text-muted-foreground">
                              Recommendation
                            </p>
                            <p className="text-sm leading-relaxed text-foreground/90">
                              {d.action_hint}
                            </p>
                            <div className="space-y-1 text-[11px] text-muted-foreground">
                              <p>Opened: {p.open_date}</p>
                              {p.expiry && <p>Expires: {p.expiry}</p>}
                              {p.notes && <p>Note: {p.notes}</p>}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Position</DialogTitle>
            <DialogDescription>
              This will permanently remove this position record. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
