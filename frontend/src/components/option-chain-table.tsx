'use client';

import { useTranslations } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { OptionWithGreeks } from '@/lib/api';

type ViewMode = 'all' | 'calls' | 'puts';

interface OptionChainTableProps {
  calls: OptionWithGreeks[];
  puts: OptionWithGreeks[];
  spotPrice: number;
  viewMode: ViewMode;
}

function HeaderTip({ label, tip }: { label: string; tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help border-b border-dashed border-muted-foreground/30">
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

function useHeaders() {
  const t = useTranslations('chainHeaders');
  return [
    { key: 'oi', label: t('oi'), tip: t('oiTip') },
    { key: 'vol', label: t('vol'), tip: t('volTip') },
    { key: 'price', label: t('price'), tip: t('priceTip') },
    { key: 'iv', label: t('iv'), tip: t('ivTip') },
    { key: 'delta', label: t('delta'), tip: t('deltaTip') },
    { key: 'gamma', label: t('gamma'), tip: t('gammaTip') },
    { key: 'theta', label: t('theta'), tip: t('thetaTip') },
    { key: 'vega', label: t('vega'), tip: t('vegaTip') },
    { key: 'pop', label: t('pop'), tip: t('popTip') },
    { key: 'ann_ret', label: t('annRet'), tip: t('annRetTip') },
  ];
}

function buildCells(opt: OptionWithGreeks) {
  const { greeks, quote, pop, annualized_return } = opt;
  const price = parseFloat(quote.last_done);
  const iv = parseFloat(quote.implied_volatility ?? '0');

  return [
    { val: String(quote.open_interest ?? '-'), cls: 'text-muted-foreground' },
    { val: String(quote.volume ?? '0'), cls: 'text-muted-foreground' },
    { val: '$' + price.toFixed(2), cls: 'font-medium text-foreground' },
    { val: (iv * 100).toFixed(1) + '%', cls: 'text-foreground' },
    {
      val: greeks.delta.toFixed(3),
      cls: Math.abs(greeks.delta) > 0.4 ? 'text-chart-5' : 'text-muted-foreground',
    },
    { val: greeks.gamma.toFixed(4), cls: 'text-muted-foreground' },
    { val: greeks.theta.toFixed(3), cls: 'text-chart-2' },
    { val: greeks.vega.toFixed(3), cls: 'text-muted-foreground' },
    { val: pop.toFixed(0) + '%', cls: pop >= 60 ? 'text-chart-2 font-medium' : 'text-foreground' },
    {
      val: annualized_return ? annualized_return.toFixed(0) + '%' : '-',
      cls: 'text-foreground',
    },
  ];
}

function OptionDataCells({ opt }: { opt: OptionWithGreeks }) {
  const cells = buildCells(opt);
  return (
    <>
      {cells.map((c, i) => (
        <TableCell key={i} className={cn('text-right font-mono text-xs', c.cls)}>
          {c.val}
        </TableCell>
      ))}
    </>
  );
}

function OptionDataCellsReversed({ opt }: { opt: OptionWithGreeks }) {
  const cells = buildCells(opt).reverse();
  return (
    <>
      {cells.map((c, i) => (
        <TableCell key={i} className={cn('text-right font-mono text-xs', c.cls)}>
          {c.val}
        </TableCell>
      ))}
    </>
  );
}

function EmptyCells({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <TableCell key={i} className="text-right text-xs text-muted-foreground/30">
          -
        </TableCell>
      ))}
    </>
  );
}

function buildStrikeMap(calls: OptionWithGreeks[], puts: OptionWithGreeks[]) {
  const map = new Map<string, { call?: OptionWithGreeks; put?: OptionWithGreeks }>();

  for (const c of calls) {
    const k = c.quote.strike_price ?? '';
    map.set(k, { ...map.get(k), call: c });
  }
  for (const p of puts) {
    const k = p.quote.strike_price ?? '';
    map.set(k, { ...map.get(k), put: p });
  }

  return [...map.entries()].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
}

function StrikeCell({ strike, spotPrice }: { strike: number; spotPrice: number }) {
  const isNearMoney = Math.abs(strike - spotPrice) / spotPrice < 0.02;
  return (
    <TableCell
      className={cn(
        'bg-muted text-center font-mono text-xs font-bold text-foreground',
        isNearMoney && 'text-primary',
      )}
    >
      ${strike.toFixed(2)}
    </TableCell>
  );
}

function AllView({ calls, puts, spotPrice }: Omit<OptionChainTableProps, 'viewMode'>) {
  const headers = useHeaders();
  const t = useTranslations('chain');
  const sorted = buildStrikeMap(calls, puts);
  const reversedHeaders = [...headers].reverse();

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b border-border hover:bg-transparent">
          <TableHead
            colSpan={headers.length}
            className="h-8 text-center text-[11px] font-bold text-chart-2"
          >
            {t('headerCalls')}
          </TableHead>
          <TableHead className="h-8 bg-muted" />
          <TableHead
            colSpan={headers.length}
            className="h-8 text-center text-[11px] font-bold text-destructive"
          >
            {t('headerPuts')}
          </TableHead>
        </TableRow>
        <TableRow className="border-b border-border hover:bg-transparent">
          {headers.map((h) => (
            <TableHead
              key={`c-${h.key}`}
              className="h-8 text-right text-[10px] font-medium text-muted-foreground"
            >
              <HeaderTip label={h.label} tip={h.tip} />
            </TableHead>
          ))}
          <TableHead className="h-8 bg-muted text-center text-[10px] font-bold text-foreground">
            {t('strike')}
          </TableHead>
          {reversedHeaders.map((h) => (
            <TableHead
              key={`p-${h.key}`}
              className="h-8 text-right text-[10px] font-medium text-muted-foreground"
            >
              <HeaderTip label={h.label} tip={h.tip} />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map(([strike, { call, put }]) => {
          const s = parseFloat(strike);
          const isNearMoney = Math.abs(s - spotPrice) / spotPrice < 0.02;
          return (
            <TableRow
              key={strike}
              className={cn('border-b border-border/50', isNearMoney && 'bg-primary/5')}
            >
              {call ? <OptionDataCells opt={call} /> : <EmptyCells count={headers.length} />}
              <StrikeCell strike={s} spotPrice={spotPrice} />
              {put ? <OptionDataCellsReversed opt={put} /> : <EmptyCells count={headers.length} />}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function SingleSideView({
  options,
  spotPrice,
  side,
}: {
  options: OptionWithGreeks[];
  spotPrice: number;
  side: 'call' | 'put';
}) {
  const headers = useHeaders();
  const t = useTranslations('chain');
  const sorted = [...options].sort(
    (a, b) => parseFloat(a.quote.strike_price ?? '0') - parseFloat(b.quote.strike_price ?? '0'),
  );

  const isCall = side === 'call';

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b border-border hover:bg-transparent">
          <TableHead className="h-8 bg-muted text-center text-[10px] font-bold text-foreground">
            {t('strike')}
          </TableHead>
          <TableHead className="h-8 text-center text-[10px] font-bold text-muted-foreground">
            {t('itmOtm')}
          </TableHead>
          {headers.map((h) => (
            <TableHead
              key={h.key}
              className="h-8 text-right text-[10px] font-medium text-muted-foreground"
            >
              <HeaderTip label={h.label} tip={h.tip} />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((opt) => {
          const strike = parseFloat(opt.quote.strike_price ?? '0');
          const isNearMoney = Math.abs(strike - spotPrice) / spotPrice < 0.02;
          const itm = isCall ? strike < spotPrice : strike > spotPrice;

          return (
            <TableRow
              key={opt.quote.symbol}
              className={cn(
                'border-b border-border/50',
                isNearMoney && 'bg-primary/5',
                itm && 'bg-muted/30',
              )}
            >
              <StrikeCell strike={strike} spotPrice={spotPrice} />
              <TableCell className="text-center text-[10px]">
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 font-medium',
                    itm ? 'bg-chart-2/10 text-chart-2' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {itm ? t('itm') : t('otm')}
                </span>
              </TableCell>
              <OptionDataCells opt={opt} />
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function OptionChainTable({ calls, puts, spotPrice, viewMode }: OptionChainTableProps) {
  if (viewMode === 'calls') {
    return <SingleSideView options={calls} spotPrice={spotPrice} side="call" />;
  }
  if (viewMode === 'puts') {
    return <SingleSideView options={puts} spotPrice={spotPrice} side="put" />;
  }
  return <AllView calls={calls} puts={puts} spotPrice={spotPrice} />;
}
