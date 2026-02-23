'use client';

import { useTranslations } from 'next-intl';
import { TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SymbolOverview } from '@/lib/api';

interface SymbolCardProps {
  data: SymbolOverview;
  onClick?: () => void;
}

export function SymbolCard({ data, onClick }: SymbolCardProps) {
  const { quote, iv_rank } = data;
  const price = parseFloat(quote.last_done);
  const changePct = quote.change_pct ?? 0;
  const isUp = changePct >= 0;
  const ticker = quote.symbol.replace('.US', '');
  const t = useTranslations('dashboard');

  return (
    <Card
      className={cn(
        'cursor-pointer border-border transition-all',
        'hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5',
      )}
      onClick={onClick}
    >
      <CardHeader>
        <CardTitle className="text-base font-semibold">{ticker}</CardTitle>
        <CardAction>
          <Badge
            variant="outline"
            className={cn(
              'gap-1 font-mono tabular-nums',
              isUp
                ? 'border-chart-2/30 bg-chart-2/10 text-chart-2'
                : 'border-destructive/30 bg-destructive/10 text-destructive',
            )}
          >
            {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {isUp ? '+' : ''}
            {changePct.toFixed(2)}%
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-2xl font-bold tabular-nums">${price.toFixed(2)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('vol')}: {(quote.volume / 1_000_000).toFixed(1)}M
            </p>
          </div>

          {iv_rank !== null && (
            <div className="text-right">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <BarChart3 className="h-3 w-3" />
                {t('ivRank')}
              </div>
              <p
                className={cn(
                  'text-lg font-semibold tabular-nums',
                  iv_rank > 50 ? 'text-chart-2' : 'text-muted-foreground',
                )}
              >
                {iv_rank.toFixed(0)}%
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
