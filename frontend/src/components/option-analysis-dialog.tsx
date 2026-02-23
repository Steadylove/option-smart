'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Markdown from 'react-markdown';
import { Loader2, RefreshCw, Send, TrendingDown, TrendingUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  api,
  type OptionWithGreeks,
  type AccountInfoResponse,
  type AiAnalysisResponse,
} from '@/lib/api';
import type { ChatMessage } from '@/lib/api';

interface Props {
  option: OptionWithGreeks | null;
  spotPrice: number;
  symbol: string;
  onClose: () => void;
}

interface MiniMessage {
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
}

export function OptionAnalysisDialog({ option, spotPrice, symbol, onClose }: Props) {
  const t = useTranslations('optionAnalysis');
  const locale = useLocale();

  const [accountData, setAccountData] = useState<AccountInfoResponse | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [aiData, setAiData] = useState<AiAnalysisResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');

  const [refreshing, setRefreshing] = useState(false);
  const [chatMessages, setChatMessages] = useState<MiniMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!option) return;
    setAccountData(null);
    setAiData(null);
    setError('');
    setChatMessages([]);
    setChatInput('');

    const reqBody = {
      option_symbol: option.quote.symbol,
      spot_price: spotPrice,
      option_data: option,
    };

    // Fast: account info
    setAccountLoading(true);
    api
      .optionAccountInfo(reqBody)
      .then(setAccountData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setAccountLoading(false));

    // Slow: AI analysis (parallel)
    setAiLoading(true);
    api
      .analyzeOption(reqBody)
      .then(setAiData)
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setError((prev) => prev || msg);
      })
      .finally(() => setAiLoading(false));
  }, [option, spotPrice]);

  const handleRefreshAccount = useCallback(async () => {
    if (!option) return;
    setRefreshing(true);
    try {
      await api.refreshAccount();
      const fresh = await api.optionAccountInfo({
        option_symbol: option.quote.symbol,
        spot_price: spotPrice,
        option_data: option,
      });
      setAccountData(fresh);
    } catch (err) {
      console.error('Account refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  }, [option, spotPrice]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  const sendFollowUp = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || streaming || !option || !aiData) return;

    const userMsg: MiniMessage = { role: 'user', content: text };
    const assistantMsg: MiniMessage = { role: 'assistant', content: '', loading: true };
    setChatMessages((prev) => [...prev, userMsg, assistantMsg]);
    setChatInput('');
    setStreaming(true);
    scrollToBottom();

    const optionContext =
      `[期权分析上下文] 合约: ${option.quote.symbol}, ` +
      `行权价: $${option.quote.strike_price}, ` +
      `类型: ${option.quote.direction === 'P' ? 'Put' : 'Call'}, ` +
      `标的: ${symbol} @ $${spotPrice}`;

    const contextMessages: ChatMessage[] = [
      { role: 'user', content: optionContext },
      { role: 'assistant', content: aiData.analysis },
      ...chatMessages.filter((m) => !m.loading).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ];

    try {
      const resp = await api.chat(contextMessages, true);
      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
          const lines = event.split('\n');
          const dataLines = lines.filter((l) => l.startsWith('data: ')).map((l) => l.slice(6));
          if (!dataLines.length) continue;
          const payload = dataLines.join('\n');
          if (payload === '[DONE]' || payload.startsWith('[TOOL:')) continue;

          accumulated += payload;
          const current = accumulated;
          setChatMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: current, loading: false };
            }
            return updated;
          });
          scrollToBottom();
        }
      }

      setChatMessages((prev) => prev.map((m) => (m.loading ? { ...m, loading: false } : m)));
    } catch (err) {
      console.error('Follow-up chat error:', err);
      setChatMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.role === 'assistant') {
          updated[updated.length - 1] = {
            ...last,
            content: locale === 'zh' ? 'AI 服务暂时不可用' : 'AI service unavailable',
            loading: false,
          };
        }
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }, [
    chatInput,
    streaming,
    option,
    aiData,
    chatMessages,
    spotPrice,
    symbol,
    locale,
    scrollToBottom,
  ]);

  if (!option) return null;

  const q = option.quote;
  const g = option.greeks;
  const isPut = q.direction === 'P';
  const price = parseFloat(q.last_done);
  const iv = parseFloat(q.implied_volatility ?? '0');
  const strike = parseFloat(q.strike_price ?? '0');

  return (
    <Dialog open={!!option} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {isPut ? (
              <TrendingDown className="h-4 w-4 text-red-400" />
            ) : (
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            )}
            {t('title')} — {q.symbol}
          </DialogTitle>
        </DialogHeader>

        {/* Contract info — always instant (from local data) */}
        <div className="rounded-lg border border-border bg-card/50 px-4 py-3">
          <div className="grid grid-cols-4 gap-y-2.5 text-xs">
            <KV label={t('type')} value={isPut ? 'PUT' : 'CALL'} />
            <KV label={t('strike')} value={`$${strike.toFixed(2)}`} />
            <KV label={t('price')} value={`$${price.toFixed(2)}`} />
            <KV label={t('dte')} value={`${option.dte}d`} />
            <KV label="IV" value={`${(iv * 100).toFixed(1)}%`} />
            <KV label="Delta" value={g.delta.toFixed(3)} />
            <KV label="Theta" value={g.theta.toFixed(3)} cls="text-emerald-400" />
            <KV label="POP" value={`${option.pop.toFixed(0)}%`} />
          </div>
        </div>

        {/* Account info — fast request, shows first */}
        <div className="rounded-lg border border-border bg-card/50 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {t('accountInfo')}
            </span>
            {accountData && (
              <button
                onClick={handleRefreshAccount}
                disabled={refreshing}
                className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                title={locale === 'zh' ? '刷新账户数据' : 'Refresh'}
              >
                <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
          {accountLoading ? (
            <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('loadingAccount')}
            </div>
          ) : accountData ? (
            <div className="grid grid-cols-3 gap-y-2.5 text-xs">
              <KV label={t('buyPower')} value={`$${fmtNum(accountData.account.buy_power)}`} />
              <KV label={t('initMargin')} value={`$${fmtNum(accountData.account.init_margin)}`} />
              <KV
                label={t('riskLevel')}
                value={riskLabel(accountData.account.risk_level as number, locale)}
              />
              <KV
                label={t('sellQty')}
                value={`${accountData.sell_qty.cash_max_qty} / ${accountData.sell_qty.margin_max_qty}`}
              />
              <KV
                label={t('buyQty')}
                value={`${accountData.buy_qty.cash_max_qty} / ${accountData.buy_qty.margin_max_qty}`}
              />
              <KV
                label={t('maintMargin')}
                value={`$${fmtNum(accountData.account.maintenance_margin)}`}
              />
            </div>
          ) : error ? (
            <p className="py-1 text-xs text-destructive">{error}</p>
          ) : null}
        </div>

        <Separator />

        {/* AI Analysis — slow request, shows when ready */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="border border-border text-[10px]">
              AI
            </Badge>
            <span className="text-xs font-medium text-muted-foreground">{t('aiAnalysis')}</span>
          </div>

          {aiLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('analyzing')}
            </div>
          ) : aiData ? (
            <div className="prose prose-sm prose-invert max-w-none text-sm">
              <Markdown>{aiData.analysis}</Markdown>
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </div>

        {/* Follow-up chat */}
        {aiData && (
          <>
            <Separator />
            <div className="space-y-2">
              {chatMessages.length > 0 && (
                <ScrollArea className="max-h-48">
                  <div className="space-y-2 pr-3">
                    {chatMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`text-xs ${
                          msg.role === 'user'
                            ? 'text-right text-foreground'
                            : 'text-left text-foreground/80'
                        }`}
                      >
                        {msg.loading ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            {t('thinking')}
                          </span>
                        ) : msg.role === 'assistant' ? (
                          <div className="prose prose-sm prose-invert max-w-none">
                            <Markdown>{msg.content}</Markdown>
                          </div>
                        ) : (
                          <span className="inline-block rounded-lg bg-primary/10 px-3 py-1.5">
                            {msg.content}
                          </span>
                        )}
                      </div>
                    ))}
                    <div ref={scrollRef} />
                  </div>
                </ScrollArea>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendFollowUp();
                }}
                className="flex gap-2"
              >
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={t('followUpPlaceholder')}
                  className="h-8 text-xs"
                  disabled={streaming}
                />
                <Button type="submit" size="sm" disabled={streaming || !chatInput.trim()}>
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </form>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function KV({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={`font-mono text-xs ${cls ?? 'text-foreground'}`}>{value}</span>
    </div>
  );
}

function fmtNum(val: unknown): string {
  if (val === null || val === undefined || val === 'N/A') return 'N/A';
  const n = typeof val === 'string' ? parseFloat(val) : (val as number);
  if (isNaN(n)) return String(val);
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function riskLabel(level: number, locale: string): string {
  const labels: Record<string, string[]> = {
    zh: ['安全', '中等', '预警', '危险'],
    en: ['Safe', 'Medium', 'Warning', 'Danger'],
  };
  const arr = labels[locale] ?? labels.en;
  if (level < 0) return 'N/A';
  return arr[Math.min(level, arr.length - 1)];
}
