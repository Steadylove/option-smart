'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Markdown from 'react-markdown';
import {
  Calendar as CalendarIcon,
  TrendingUp,
  AlertTriangle,
  Newspaper,
  ExternalLink,
  Clock,
  BarChart3,
  Landmark,
  DollarSign,
  Sparkles,
  Loader2,
  X,
  Wrench,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

import { useEventTimeline, useMarketNews } from '@/hooks/use-swr-api';
import { api } from '@/lib/api';
import type { MarketEvent, MarketNewsItem } from '@/lib/api';

const EVENT_TYPE_ICONS: Record<string, typeof CalendarIcon> = {
  earnings: BarChart3,
  fomc: Landmark,
  cpi: TrendingUp,
  gdp: BarChart3,
  jobs: TrendingUp,
  other: DollarSign,
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  earnings: 'text-amber-400',
  fomc: 'text-red-400',
  cpi: 'text-orange-400',
  gdp: 'text-blue-400',
  jobs: 'text-green-400',
  other: 'text-purple-400',
};

const IMPACT_VARIANT: Record<string, 'destructive' | 'secondary' | 'outline'> = {
  high: 'destructive',
  medium: 'secondary',
  low: 'outline',
};

const ANALYSIS_TOOL_KEYS: Record<string, string> = {
  get_portfolio_overview: 'portfolioOverview',
  get_position_list: 'positionList',
  get_upcoming_events: 'upcomingEvents',
  search_market_news: 'searchNews',
  get_alerts: 'alerts',
  get_stock_quote: 'stockQuote',
  assess_event_impact: 'eventImpact',
  get_economic_calendar: 'economicCalendar',
  run_stress_test: 'stressTest',
  get_decision_matrix: 'decisionMatrix',
};

export default function EventsPage() {
  const [newsSymbol, setNewsSymbol] = useState('all');
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisContent, setAnalysisContent] = useState('');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [toolCalls, setToolCalls] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const t = useTranslations('events');
  const tc = useTranslations('common');

  const { data: timeline, isLoading: timelineLoading } = useEventTimeline(7, 30);
  const { data: newsData, isLoading: newsLoading } = useMarketNews(
    newsSymbol === 'all' ? '' : newsSymbol,
    7,
  );

  const events = timeline?.upcoming_events || [];
  const recentNews = timeline?.recent_news || [];
  const filteredNews = newsData?.news || [];

  const earningsCount = events.filter((e) => e.type === 'earnings').length;
  const highImpactCount = events.filter((e) => e.impact === 'high').length;
  const nextEarnings = events.find((e) => e.type === 'earnings');

  const eventsByDate = groupByDate(events);

  const symbolOptions = [
    { value: 'all', label: t('allSymbols') },
    { value: 'TQQQ.US', label: 'TQQQ' },
    { value: 'TSLL.US', label: 'TSLL' },
    { value: 'NVDL.US', label: 'NVDL' },
  ];

  const runAnalysis = useCallback(async () => {
    setAnalysisOpen(true);
    setAnalysisContent('');
    setAnalysisLoading(true);
    setToolCalls([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await api.analyzeEvents();
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const lines = part.split('\n');
          const isToolEvent = lines.some((l) => l.startsWith('event: tool'));
          const dataLines = lines.filter((l) => l.startsWith('data: ')).map((l) => l.slice(6));

          if (dataLines.length === 0) continue;
          const payload = dataLines.join('\n');
          if (payload === '[DONE]') continue;

          if (isToolEvent || payload.startsWith('[TOOL:')) {
            const toolStr = payload.replace('[TOOL:', '').replace(']', '');
            setToolCalls((prev) => [...prev, ...toolStr.split(',').filter(Boolean)]);
            continue;
          }

          setAnalysisContent((prev) => prev + payload);
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setAnalysisContent((prev) => prev + `\n\n> ${t('analysisError', { error: String(err) })}`);
      }
    } finally {
      setAnalysisLoading(false);
      abortRef.current = null;
    }
  }, [t]);

  const stopAnalysis = useCallback(() => {
    abortRef.current?.abort();
    setAnalysisLoading(false);
  }, []);

  return (
    <div className="mx-auto flex h-screen max-w-7xl flex-col overflow-hidden p-6 lg:p-8">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <Button onClick={runAnalysis} disabled={analysisLoading} className="gap-2">
          {analysisLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {t('aiAnalysis')}
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <ScrollArea className="flex-1">
          <div className="px-6 py-4">
            <div className="mb-6 grid grid-cols-3 gap-4">
              <SummaryCard
                label={t('upcomingEvents')}
                value={events.length}
                sub={t('next30Days')}
                icon={CalendarIcon}
              />
              <SummaryCard
                label={t('highImpact')}
                value={highImpactCount}
                sub={t('earnings', { count: earningsCount })}
                icon={AlertTriangle}
                accent
              />
              <SummaryCard
                label={t('nextEarnings')}
                value={nextEarnings?.symbol || t('none')}
                sub={nextEarnings ? daysUntil(nextEarnings.date, tc) : t('noUpcoming')}
                icon={BarChart3}
              />
            </div>

            {analysisOpen && (
              <AnalysisPanel
                content={analysisContent}
                loading={analysisLoading}
                toolCalls={toolCalls}
                onClose={() => {
                  setAnalysisOpen(false);
                  stopAnalysis();
                }}
              />
            )}

            <h2 className="mb-4 text-sm font-semibold text-muted-foreground">
              {t('eventTimeline')}
            </h2>

            {timelineLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : events.length === 0 ? (
              <Card className="py-8">
                <CardContent className="text-center text-sm text-muted-foreground">
                  {t('noEvents')}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {Object.entries(eventsByDate).map(([dateStr, dayEvents]) => (
                  <DateGroup key={dateStr} date={dateStr} events={dayEvents} />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="w-96 shrink-0 border-l border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{t('latestNews')}</h2>
            <Select value={newsSymbol} onValueChange={setNewsSymbol}>
              <SelectTrigger size="sm" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {symbolOptions.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ScrollArea className="h-[calc(100vh-8.5rem)]">
            <div className="space-y-3 px-4 py-3">
              {newsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-lg" />
                ))
              ) : (filteredNews.length > 0 ? filteredNews : recentNews).length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{t('noNews')}</p>
              ) : (
                (filteredNews.length > 0 ? filteredNews : recentNews).map((item, i) => (
                  <NewsCard key={i} item={item} />
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

function AnalysisPanel({
  content,
  loading,
  toolCalls,
  onClose,
}: {
  content: string;
  loading: boolean;
  toolCalls: string[];
  onClose: () => void;
}) {
  const t = useTranslations('events');

  const hasContent = content.trim().length > 0;
  const showToolPhase = loading && !hasContent && toolCalls.length > 0;

  return (
    <Card className="mb-6 overflow-hidden border-primary/30 bg-primary/5">
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">{t('aiAnalysis')}</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-4 pb-4">
          {!hasContent && loading && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                {showToolPhase ? t('callingTools') : t('preparingAnalysis')}
              </div>
              {toolCalls.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {toolCalls.map((tool, i) => (
                    <Badge key={i} variant="outline" className="gap-1 text-[10px]">
                      <Wrench className="h-3 w-3" />
                      {ANALYSIS_TOOL_KEYS[tool]
                        ? t(`toolLabels.${ANALYSIS_TOOL_KEYS[tool]}`)
                        : tool}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {hasContent && (
            <>
              {toolCalls.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {toolCalls.map((tool, i) => (
                    <Badge key={i} variant="outline" className="gap-1 text-[10px] opacity-60">
                      <Wrench className="h-3 w-3" />
                      {ANALYSIS_TOOL_KEYS[tool]
                        ? t(`toolLabels.${ANALYSIS_TOOL_KEYS[tool]}`)
                        : tool}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                <Markdown
                  components={{
                    h2: ({ children }) => (
                      <h2 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="mb-1.5 mt-3 text-sm font-semibold">{children}</h3>
                    ),
                    ul: ({ children }) => (
                      <ul className="my-1.5 ml-4 list-disc space-y-0.5">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="my-1.5 ml-4 list-decimal space-y-0.5">{children}</ol>
                    ),
                    li: ({ children }) => <li className="text-sm">{children}</li>,
                    p: ({ children }) => (
                      <p className="my-1.5 text-sm leading-relaxed">{children}</p>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-primary">{children}</strong>
                    ),
                    code: ({ children }) => (
                      <code className="rounded bg-muted px-1 py-0.5 text-xs">{children}</code>
                    ),
                  }}
                >
                  {content}
                </Markdown>
                {loading && (
                  <span className="ml-1 inline-block h-4 w-1.5 animate-pulse bg-primary" />
                )}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: typeof CalendarIcon;
  accent?: boolean;
}) {
  return (
    <Card className="gap-2 py-4">
      <CardContent className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${accent ? 'text-red-400' : 'text-muted-foreground'}`} />
      </CardContent>
      <CardContent>
        <p className={`text-2xl font-bold ${accent ? 'text-red-400' : ''}`}>{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function DateGroup({ date, events }: { date: string; events: MarketEvent[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const isToday = date === today;
  const isPast = date < today;
  const tc = useTranslations('common');

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <div
          className={`h-2 w-2 rounded-full ${isToday ? 'bg-primary' : isPast ? 'bg-muted-foreground' : 'bg-muted-foreground/50'}`}
        />
        <span
          className={`text-xs font-semibold ${isToday ? 'text-primary' : 'text-muted-foreground'}`}
        >
          {formatDate(date)}
          {isToday && ` (${tc('today')})`}
        </span>
      </div>

      <div className="ml-3 space-y-2 border-l border-border pl-4">
        {events.map((event, i) => (
          <EventCard key={i} event={event} />
        ))}
      </div>
    </div>
  );
}

function EventCard({ event }: { event: MarketEvent }) {
  const Icon = EVENT_TYPE_ICONS[event.type] || EVENT_TYPE_ICONS.other;
  const color = EVENT_TYPE_COLORS[event.type] || EVENT_TYPE_COLORS.other;
  const t = useTranslations('events');

  return (
    <Card className="gap-2 py-3">
      <CardContent>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${color}`} />
            <span className="text-sm font-medium">{event.title}</span>
            {event.symbol && (
              <Badge variant="secondary" className="text-[10px]">
                {event.symbol}
              </Badge>
            )}
          </div>
          <Badge variant={IMPACT_VARIANT[event.impact] || 'outline'} className="text-[10px]">
            {event.impact}
          </Badge>
        </div>
        {event.description && (
          <p className="mt-1.5 text-xs text-muted-foreground">{event.description}</p>
        )}
        {event.type === 'earnings' && (
          <div className="mt-2 flex gap-3 text-xs">
            {event.eps_estimate != null && (
              <span className="text-muted-foreground">
                {t('epsEstimate')} <span className="text-foreground">{event.eps_estimate}</span>
              </span>
            )}
            {event.eps_actual != null && (
              <span className="text-muted-foreground">
                {t('epsActual')} <span className="text-foreground">{event.eps_actual}</span>
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NewsCard({ item }: { item: MarketNewsItem }) {
  return (
    <Card className="gap-2 py-3">
      <CardContent>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <Newspaper className="h-3 w-3 shrink-0 text-muted-foreground" />
              {item.symbol && (
                <Badge variant="secondary" className="text-[10px]">
                  {item.symbol}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs font-medium leading-snug">{item.headline}</p>
            {item.summary && (
              <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{item.summary}</p>
            )}
          </div>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
          {item.source && <span>{item.source}</span>}
          {item.published_at && (
            <>
              <span>·</span>
              <Clock className="h-3 w-3" />
              <span>{formatRelativeTime(item.published_at)}</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function groupByDate(events: MarketEvent[]): Record<string, MarketEvent[]> {
  const grouped: Record<string, MarketEvent[]> = {};
  for (const event of events) {
    const dateKey = event.date?.slice(0, 10) || 'unknown';
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(event);
  }
  return grouped;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function daysUntil(dateStr: string, tc: ReturnType<typeof useTranslations<'common'>>): string {
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const diff = Math.ceil((target.getTime() - now.getTime()) / 86400000);
  if (diff === 0) return tc('today');
  if (diff === 1) return tc('tomorrow');
  return tc('inDays', { days: diff });
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
