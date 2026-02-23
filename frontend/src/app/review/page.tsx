'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import {
  FileBarChart,
  Search,
  TrendingUp,
  TrendingDown,
  Newspaper,
  Calendar as CalendarIcon,
  ExternalLink,
  Loader2,
  AlertCircle,
  Clock,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

import { api } from '@/lib/api';
import type { MarketNewsItem, PriceAttributionResponse } from '@/lib/api';

const SYMBOLS = [
  { value: 'TQQQ.US', label: 'TQQQ' },
  { value: 'TSLA', label: 'TSLA (→ TSLL)' },
  { value: 'NVDA', label: 'NVDA (→ NVDL)' },
  { value: 'QQQ', label: 'QQQ (→ TQQQ)' },
];

export default function ReviewPage() {
  const [symbol, setSymbol] = useState(SYMBOLS[0].value);
  const [date, setDate] = useState<Date>(new Date());
  const [result, setResult] = useState<PriceAttributionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const t = useTranslations('review');
  const tc = useTranslations('common');

  const analyze = useCallback(async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const data = await api.getPriceAttribution(symbol, dateStr);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to analyze');
    } finally {
      setLoading(false);
    }
  }, [symbol, date]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="border-b border-border px-6 py-4">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <FileBarChart className="h-5 w-5" />
          {t('title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-6 py-4">
          <div className="mb-6 flex items-end gap-4 rounded-xl border border-border bg-card px-5 py-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t('symbol')}</Label>
              <Select value={symbol} onValueChange={setSymbol}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SYMBOLS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t('date')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-9 w-44 justify-start font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                    {format(date, 'MMM d, yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && setDate(d)}
                    disabled={{ after: new Date() }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <Button onClick={analyze} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {tc('analyze')}
            </Button>
          </div>

          {error && (
            <Card className="mb-4 border-red-500/30 bg-red-500/5">
              <CardContent className="flex items-center gap-2 text-sm text-red-400">
                <AlertCircle className="h-4 w-4" />
                {error}
              </CardContent>
            </Card>
          )}

          {loading && (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          )}

          {result && !loading && <AttributionResult data={result} />}

          {!result && !loading && !error && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <FileBarChart className="mb-4 h-12 w-12 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">{t('selectPrompt')}</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function AttributionResult({ data }: { data: PriceAttributionResponse }) {
  const hasPrice = data.price_change != null;
  const isUp = (data.price_change ?? 0) >= 0;
  const t = useTranslations('review');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${isUp ? 'bg-green-500/15' : 'bg-red-500/15'}`}
            >
              {isUp ? (
                <TrendingUp className="h-5 w-5 text-green-400" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-400" />
              )}
            </div>
            <div>
              <CardTitle className="text-sm">
                {data.symbol.replace('.US', '')} on {formatDateLong(data.date)}
              </CardTitle>
              {hasPrice ? (
                <CardDescription
                  className={`text-lg font-bold ${isUp ? 'text-green-400' : 'text-red-400'}`}
                >
                  {isUp ? '+' : ''}
                  {data.price_change?.toFixed(2)} ({isUp ? '+' : ''}
                  {data.price_change_pct?.toFixed(2)}%)
                </CardDescription>
              ) : (
                <CardDescription>{t('priceUnavailable')}</CardDescription>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Newspaper className="h-4 w-4 text-muted-foreground" />
          {t('possibleReasons')}
          <Badge variant="secondary" className="text-[10px]">
            {data.attributions.length}
          </Badge>
        </h3>

        {data.attributions.length === 0 ? (
          <Card className="py-8">
            <CardContent className="text-center text-sm text-muted-foreground">
              {t('noNewsEvents')}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {data.attributions.map((item, i) => (
              <AttributionCard key={i} item={item} rank={i + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AttributionCard({ item, rank }: { item: MarketNewsItem; rank: number }) {
  const isEconomic = item.source === 'Economic Calendar';
  const t = useTranslations('review');
  const tc = useTranslations('common');

  return (
    <Card className="gap-2 py-3">
      <CardContent>
        <div className="flex items-start gap-3">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
            {rank}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {isEconomic ? (
                <CalendarIcon className="h-3.5 w-3.5 text-orange-400" />
              ) : (
                <Newspaper className="h-3.5 w-3.5 text-blue-400" />
              )}
              <Badge variant="outline" className="text-[10px]">
                {isEconomic ? t('economicEvent') : t('news')}
              </Badge>
              {item.relevance && (
                <Badge
                  variant={item.relevance === 'high' ? 'destructive' : 'secondary'}
                  className="text-[10px]"
                >
                  {item.relevance}
                </Badge>
              )}
            </div>

            <h4 className="mt-1 text-sm font-medium">{item.headline}</h4>
            {item.summary && <p className="mt-1 text-xs text-muted-foreground">{item.summary}</p>}

            <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
              {item.source && item.source !== 'Economic Calendar' && <span>{item.source}</span>}
              {item.published_at && (
                <>
                  <Clock className="h-3 w-3" />
                  <span>{formatRelativeTime(item.published_at)}</span>
                </>
              )}
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {tc('source')}
                </a>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDateLong(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatRelativeTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${diffMin}m`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d`;
  } catch {
    return '';
  }
}
