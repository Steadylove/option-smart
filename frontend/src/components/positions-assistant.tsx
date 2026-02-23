'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Image from 'next/image';
import {
  Brain,
  ChevronDown,
  Loader2,
  MessageSquare,
  Send,
  Square,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { streamPostSse } from '@/lib/sse';
import type { PositionAnalysisResponse } from '@/lib/api';

const TOOL_LABELS: Record<string, string> = {
  get_stock_quote: '查询实时股价',
  get_position_detail: '查看持仓详情',
  get_position_list: '持仓列表',
  get_portfolio_overview: '组合概览',
  search_market_news: '搜索市场新闻',
  get_alerts: '风险告警',
  get_decision_matrix: '决策矩阵',
  get_metric_definitions: '查询指标公式',
  run_stress_test: '压力测试',
  get_upcoming_events: '近期事件',
  get_economic_calendar: '经济日历',
  analyze_price_change: '价格变动分析',
  assess_event_impact: '事件影响评估',
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
  tools?: string[];
  thinking?: string;
  loading?: boolean;
}

interface PositionsAssistantProps {
  analysisData: PositionAnalysisResponse | null;
}

export function PositionsAssistant({ analysisData }: PositionsAssistantProps) {
  const t = useTranslations('posAssistant');
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [deepThinking, setDeepThinking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.role === 'assistant') {
        updated[updated.length - 1] = { ...last, loading: false };
      }
      return updated;
    });
    setStreaming(false);
  }, []);

  const clearMessages = useCallback(() => {
    if (streaming) return;
    setMessages([]);
  }, [streaming]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;

      const userMsg: Message = { role: 'user', content: text.trim() };
      const assistantMsg: Message = { role: 'assistant', content: '', loading: true };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput('');
      setStreaming(true);

      const historyForApi = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const controller = new AbortController();
      abortRef.current = controller;

      let accText = '';
      let accThinking = '';
      let accTools: string[] = [];

      await streamPostSse(
        '/api/positions/ask',
        {
          question: text.trim(),
          messages: historyForApi,
          context: analysisData ? JSON.stringify(analysisData) : '',
          deep_thinking: deepThinking,
        },
        {
          onText: (chunk) => {
            accText += chunk;
            const content = accText;
            const tools = accTools.length ? [...accTools] : undefined;
            const thinking = accThinking || undefined;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'assistant',
                content,
                tools,
                thinking,
                loading: true,
              };
              return updated;
            });
          },
          onTool: (tools) => {
            accTools.push(...tools);
            const toolsCopy = [...accTools];
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                tools: toolsCopy,
              };
              return updated;
            });
          },
          onThinking: (chunk) => {
            accThinking += chunk;
            const thinking = accThinking;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                thinking,
                loading: true,
              };
              return updated;
            });
          },
          onDone: () => {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === 'assistant') {
                updated[updated.length - 1] = { ...last, loading: false };
              }
              return updated;
            });
            setStreaming(false);
          },
          onError: (err) => {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'assistant',
                content: err,
                loading: false,
              };
              return updated;
            });
            setStreaming(false);
          },
        },
        controller.signal,
      );
    },
    [analysisData, messages, streaming, deepThinking],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (streaming) {
      stopStreaming();
    } else {
      sendMessage(input);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const suggestions = [t('suggest1'), t('suggest2'), t('suggest3')];

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center',
          'rounded-full bg-primary text-primary-foreground shadow-lg',
          'transition-transform hover:scale-105 active:scale-95',
          open && 'scale-0',
        )}
      >
        <MessageSquare className="h-5 w-5" />
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className={cn(
            'fixed bottom-6 right-6 z-50 flex flex-col',
            'h-[640px] w-[460px] rounded-xl border border-border',
            'bg-background shadow-2xl',
          )}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Image
                src="/Robby.jpg"
                alt="Robby"
                width={24}
                height={24}
                className="h-6 w-6 shrink-0 rounded-md object-cover"
              />
              <span className="text-sm font-semibold">{t('title')}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearMessages}
                disabled={streaming || messages.length === 0}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
                title={t('clear')}
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            <div className="space-y-4 py-4">
              {messages.length === 0 && (
                <div className="space-y-3 pt-4">
                  <p className="text-center text-xs text-muted-foreground">{t('emptyHint')}</p>
                  <div className="space-y-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => sendMessage(s)}
                        className={cn(
                          'w-full rounded-lg border border-border px-3 py-2',
                          'text-left text-xs text-foreground/80',
                          'transition-colors hover:bg-muted',
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex gap-2',
                    msg.role === 'user' ? 'justify-end' : 'justify-start',
                  )}
                >
                  {msg.role === 'assistant' && (
                    <Image
                      src="/Robby.jpg"
                      alt="Robby"
                      width={28}
                      height={28}
                      className="mt-0.5 h-7 w-7 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className={cn('max-w-[85%] space-y-1.5')}>
                    {/* Tool badges */}
                    {msg.tools && msg.tools.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {msg.tools.map((tool, j) => (
                          <span
                            key={j}
                            className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            <Wrench className="h-2.5 w-2.5" />
                            {TOOL_LABELS[tool] || tool}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Thinking block */}
                    {msg.thinking && <ThinkingBlock content={msg.thinking} loading={msg.loading} />}

                    {/* Message bubble */}
                    <div
                      className={cn(
                        'rounded-lg px-3 py-2 text-sm leading-relaxed',
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/60 text-foreground',
                        msg.loading && msg.thinking && !msg.content ? 'hidden' : '',
                      )}
                    >
                      {msg.loading && !msg.content && !msg.thinking ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span className="text-xs">{t('thinking')}</span>
                        </div>
                      ) : msg.role === 'assistant' ? (
                        <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                          <Markdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              h2: ({ children }) => (
                                <h2 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">
                                  {children}
                                </h2>
                              ),
                              h3: ({ children }) => (
                                <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0">
                                  {children}
                                </h3>
                              ),
                              ul: ({ children }) => (
                                <ul className="my-1 list-inside list-disc space-y-0.5 pl-1">
                                  {children}
                                </ul>
                              ),
                              ol: ({ children }) => (
                                <ol className="my-1 list-inside list-decimal space-y-0.5 pl-1">
                                  {children}
                                </ol>
                              ),
                              li: ({ children }) => <li className="text-sm">{children}</li>,
                              p: ({ children }) => <p className="my-1">{children}</p>,
                              strong: ({ children }) => (
                                <strong className="font-semibold text-foreground">
                                  {children}
                                </strong>
                              ),
                              code: ({ children }) => (
                                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                                  {children}
                                </code>
                              ),
                              a: ({ href, children }) => (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary underline hover:text-primary/80"
                                >
                                  {children}
                                </a>
                              ),
                              hr: () => <hr className="my-2 border-border/50" />,
                              table: ({ children }) => (
                                <div className="my-1.5 overflow-x-auto">
                                  <table className="w-full border-collapse text-xs">
                                    {children}
                                  </table>
                                </div>
                              ),
                              thead: ({ children }) => (
                                <thead className="border-b border-border bg-muted/50">
                                  {children}
                                </thead>
                              ),
                              th: ({ children }) => (
                                <th className="px-2 py-1 text-left text-[11px] font-medium text-muted-foreground">
                                  {children}
                                </th>
                              ),
                              td: ({ children }) => (
                                <td className="border-b border-border/50 px-2 py-1">{children}</td>
                              ),
                            }}
                          >
                            {msg.content}
                          </Markdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                      {msg.loading && msg.content && (
                        <Loader2 className="mt-1 inline-block h-3 w-3 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="shrink-0 border-t border-border p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('placeholder')}
                rows={1}
                disabled={streaming}
                className={cn(
                  'flex-1 resize-none rounded-lg border border-border bg-muted/50 px-3 py-2',
                  'text-sm placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-1 focus:ring-primary',
                  'disabled:opacity-50',
                )}
              />
              {!streaming && (
                <Button
                  type="button"
                  size="icon"
                  variant={deepThinking ? 'default' : 'outline'}
                  onClick={() => setDeepThinking((v) => !v)}
                  className="h-9 w-9 shrink-0"
                  title={t(deepThinking ? 'deepOn' : 'deepOff')}
                >
                  <Brain className="h-4 w-4" />
                </Button>
              )}
              {streaming ? (
                <Button
                  type="submit"
                  size="icon"
                  variant="destructive"
                  className="h-9 w-9 shrink-0"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim()}
                  className="h-9 w-9 shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function ThinkingBlock({ content, loading }: { content: string; loading?: boolean }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('posAssistant');

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <Brain className="h-3 w-3" />
        <span className="flex-1 text-left font-medium">
          {loading ? t('deepThinking') : t('deepDone')}
        </span>
        {loading && <Loader2 className="h-3 w-3 animate-spin" />}
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-border/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground/80">
          <pre className="whitespace-pre-wrap font-sans">{content}</pre>
        </div>
      )}
    </div>
  );
}
