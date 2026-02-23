'use client';

import { useState, useMemo, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  STRATEGIES,
  STRATEGY_KEYS,
  STRATEGY_INFO,
  PARAM_LABELS,
  generatePayoff,
  type StrategyKey,
} from '@/lib/strategies';

function PayoffTooltip({ active, payload, locale }: Record<string, unknown>) {
  if (!active || !Array.isArray(payload) || !payload.length) return null;
  const { price, pnl } = payload[0].payload as { price: number; pnl: number };
  const isZh = locale === 'zh';
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="text-muted-foreground">
        {isZh ? '股价' : 'Price'}: ${price.toFixed(2)}
      </p>
      <p className={pnl >= 0 ? 'font-medium text-emerald-400' : 'font-medium text-red-400'}>
        {pnl >= 0 ? '+' : ''}
        {pnl.toFixed(2)} {isZh ? '/股' : '/sh'}
      </p>
      <p className="text-muted-foreground">
        = ${(pnl * 100).toFixed(0)} {isZh ? '/合约' : '/contract'}
      </p>
    </div>
  );
}

export function PayoffChart() {
  const t = useTranslations('learn');
  const locale = useLocale() as 'en' | 'zh';
  const [active, setActive] = useState<StrategyKey>('csp');
  const strategy = STRATEGIES[active];
  const info = STRATEGY_INFO[active][locale];

  const [params, setParams] = useState<Record<string, number>>(() =>
    Object.fromEntries(strategy.params.map((p) => [p.key, p.default])),
  );

  const handleStrategyChange = useCallback(
    (key: StrategyKey) => {
      setActive(key);
      const s = STRATEGIES[key];
      setParams(Object.fromEntries(s.params.map((p) => [p.key, p.default])));
    },
    [setActive, setParams],
  );

  const handleParam = useCallback(
    (key: string, val: string) => {
      const num = parseFloat(val);
      if (!isNaN(num)) setParams((prev) => ({ ...prev, [key]: num }));
    },
    [setParams],
  );

  const data = useMemo(() => generatePayoff(active, params), [active, params]);
  const metrics = useMemo(() => strategy.metrics(params), [strategy, params]);

  const gradientOffset = useMemo(() => {
    const max = Math.max(...data.map((d) => d.pnl));
    const min = Math.min(...data.map((d) => d.pnl));
    if (max <= 0) return 0;
    if (min >= 0) return 1;
    return max / (max - min);
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {STRATEGY_KEYS.map((key) => (
          <Badge
            key={key}
            variant={active === key ? 'default' : 'secondary'}
            className={`cursor-pointer border transition-colors ${
              active === key ? 'border-primary' : 'border-border hover:border-primary/50'
            }`}
            onClick={() => handleStrategyChange(key)}
          >
            {STRATEGY_INFO[key][locale].name}
          </Badge>
        ))}
      </div>

      <div className="flex items-start gap-2">
        <p className="text-sm text-muted-foreground">{info.desc}</p>
        <Badge variant="outline" className="shrink-0 border-border">
          {info.outlook}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="border-border lg:col-span-2">
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="payoffFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={gradientOffset} stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset={gradientOffset} stopColor="#ef4444" stopOpacity={0.3} />
                  </linearGradient>
                  <linearGradient id="payoffStroke" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={gradientOffset} stopColor="#22c55e" />
                    <stop offset={gradientOffset} stopColor="#ef4444" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis
                  dataKey="price"
                  tick={{ fontSize: 11, fill: '#a1a1aa' }}
                  tickFormatter={(v: number) => `$${v}`}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#a1a1aa' }}
                  tickFormatter={(v: number) => `$${v}`}
                />
                <Tooltip content={<PayoffTooltip locale={locale} />} />
                <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" />
                {metrics.breakevens.map((be, i) => (
                  <ReferenceLine
                    key={i}
                    x={+be.toFixed(2)}
                    stroke="#eab308"
                    strokeDasharray="4 4"
                    label={{
                      value: `BE $${be.toFixed(2)}`,
                      position: 'top',
                      fill: '#eab308',
                      fontSize: 11,
                    }}
                  />
                ))}
                <Area
                  type="monotone"
                  dataKey="pnl"
                  stroke="url(#payoffStroke)"
                  fill="url(#payoffFill)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border">
            <CardContent className="space-y-3 pt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase">
                {t('adjustParams')}
              </p>
              {strategy.params.map((p) => (
                <div key={p.key} className="space-y-1">
                  <Label className="text-xs">{PARAM_LABELS[p.key]?.[locale] ?? p.key}</Label>
                  <Input
                    type="number"
                    value={params[p.key] ?? p.default}
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    className="h-8 text-sm"
                    onChange={(e) => handleParam(p.key, e.target.value)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="space-y-2 pt-4">
              <MetricRow
                label={t('maxProfit')}
                value={`+$${(metrics.maxProfit * 100).toFixed(0)}`}
                className="text-emerald-400"
              />
              <MetricRow
                label={t('maxLoss')}
                value={
                  metrics.maxLoss === null
                    ? t('unlimited')
                    : `-$${Math.abs(metrics.maxLoss * 100).toFixed(0)}`
                }
                className="text-red-400"
              />
              {metrics.breakevens.map((be, i) => (
                <MetricRow
                  key={i}
                  label={`${t('breakeven')}${metrics.breakevens.length > 1 ? ` ${i + 1}` : ''}`}
                  value={`$${be.toFixed(2)}`}
                  className="text-yellow-400"
                />
              ))}
              <p className="pt-1 text-[10px] text-muted-foreground">{t('perContract')}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono font-medium ${className ?? ''}`}>{value}</span>
    </div>
  );
}
