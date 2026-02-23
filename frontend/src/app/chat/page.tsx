'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Markdown from 'react-markdown';
import { Send, User, Loader2, Plus, Wrench, MessageSquare, Trash2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';
import {
  buildContextMessages,
  createConversation,
  deleteConversation,
  loadConversations,
  updateConversation,
} from '@/lib/chat-store';
import type { Conversation, DisplayMessage } from '@/lib/chat-store';

const TOOL_LABEL_KEYS: Record<string, string> = {
  get_portfolio_overview: 'portfolioOverview',
  get_position_list: 'positionList',
  get_position_detail: 'positionDetail',
  get_stock_quote: 'stockQuote',
  run_stress_test: 'stressTest',
  get_decision_matrix: 'decisionMatrix',
  get_alerts: 'alerts',
};

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const t = useTranslations('chat');

  useEffect(() => {
    const stored = loadConversations();
    setConversations(stored);
    if (stored.length > 0) {
      setActiveId(stored[0].id);
      setMessages(stored[0].messages);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  useEffect(scrollToBottom, [messages, scrollToBottom]);

  const refreshConversations = useCallback(() => {
    setConversations(loadConversations());
  }, []);

  const handleNewChat = useCallback(() => {
    const conv = createConversation();
    setActiveId(conv.id);
    setMessages([]);
    refreshConversations();
    inputRef.current?.focus();
  }, [refreshConversations]);

  const handleSelectChat = useCallback(
    (id: string) => {
      if (isStreaming) return;
      const all = loadConversations();
      const conv = all.find((c) => c.id === id);
      if (conv) {
        setActiveId(conv.id);
        setMessages(conv.messages);
      }
    },
    [isStreaming],
  );

  const handleDeleteChat = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      deleteConversation(id);
      refreshConversations();
      if (activeId === id) {
        const remaining = loadConversations();
        if (remaining.length > 0) {
          setActiveId(remaining[0].id);
          setMessages(remaining[0].messages);
        } else {
          setActiveId(null);
          setMessages([]);
        }
      }
    },
    [activeId, refreshConversations],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      let currentId = activeId;
      if (!currentId) {
        const conv = createConversation();
        currentId = conv.id;
        setActiveId(currentId);
        refreshConversations();
      }

      const userMsg: DisplayMessage = { role: 'user', content: text.trim() };
      const assistantMsg: DisplayMessage = { role: 'assistant', content: '', loading: true };
      const newMessages = [...messages, userMsg, assistantMsg];

      setMessages(newMessages);
      setInput('');
      setIsStreaming(true);

      const allCompleted = [...messages, userMsg];
      const contextMessages = buildContextMessages(allCompleted);

      try {
        const resp = await api.chat(contextMessages, true);
        const reader = resp.body?.getReader();
        if (!reader) throw new Error('No reader');

        const decoder = new TextDecoder();
        let accumulated = '';
        const tools: string[] = [];
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const event of events) {
            const lines = event.split('\n');
            const isToolEvent = lines.some((l) => l.startsWith('event: tool'));
            const dataLines = lines.filter((l) => l.startsWith('data: ')).map((l) => l.slice(6));

            if (dataLines.length === 0) continue;
            const payload = dataLines.join('\n');
            if (payload === '[DONE]') continue;

            if (isToolEvent || payload.startsWith('[TOOL:')) {
              const toolStr = payload.replace('[TOOL:', '').replace(']', '');
              tools.push(...toolStr.split(',').filter(Boolean));
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, tools: [...tools] };
                }
                return updated;
              });
              continue;
            }

            accumulated += payload;
            const current = accumulated;
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last.role === 'assistant') {
                updated[updated.length - 1] = {
                  ...last,
                  content: current,
                  loading: false,
                  tools: tools.length > 0 ? [...tools] : undefined,
                };
              }
              return updated;
            });
          }
        }

        setMessages((prev) => {
          const final = prev.map((m) => (m.loading ? { ...m, loading: false } : m));
          updateConversation(currentId!, final);
          refreshConversations();
          return final;
        });
      } catch (err) {
        console.error('Chat error:', err);
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              content: t('connectionError'),
              loading: false,
            };
          }
          updateConversation(currentId!, updated);
          refreshConversations();
          return updated;
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [activeId, isStreaming, messages, refreshConversations, t],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const suggestions = [
    t('suggestions.analyzeRisk'),
    t('suggestions.priorityPositions'),
    t('suggestions.tqqqDrop'),
    t('suggestions.sellPut'),
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <div className="flex w-64 shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold">{t('chats')}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNewChat}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <Separator />
        <ScrollArea className="flex-1">
          <div className="space-y-0.5 p-2">
            {conversations.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                {t('noConversations')}
              </p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => handleSelectChat(conv.id)}
                  className={`group flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    activeId === conv.id
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm leading-tight">{conv.title}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] opacity-60">
                      <Clock className="h-2.5 w-2.5" />
                      <FormatTime ts={conv.updatedAt} />
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDeleteChat(conv.id, e)}
                    className="mt-0.5 hidden shrink-0 rounded p-0.5 hover:bg-destructive/20 group-hover:block"
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex flex-1 flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto py-6">
          {messages.length === 0 ? (
            <EmptyState suggestions={suggestions} onSuggestion={sendMessage} />
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 px-4">
              {messages.map((msg, idx) => (
                <MessageBubble key={idx} message={msg} />
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 pt-4 pb-2">
          <div className="mx-auto max-w-3xl">
            <div className="relative flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('placeholder')}
                rows={1}
                disabled={isStreaming}
                className="w-full resize-none rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:opacity-50"
                style={{ minHeight: '44px', maxHeight: '120px' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                }}
              />
              <Button
                size="icon"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isStreaming}
                className="h-11 w-11 shrink-0"
              >
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">{t('poweredBy')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  suggestions,
  onSuggestion,
}: {
  suggestions: string[];
  onSuggestion: (text: string) => void;
}) {
  const t = useTranslations('chat');

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 pt-12">
      <Image src="/Robby.jpg" alt="Robby" width={80} height={80} className="rounded-2xl" />
      <h2 className="mt-4 text-lg font-semibold">{t('greeting')}</h2>
      <p className="mt-1 text-center text-sm text-muted-foreground">{t('greetingDesc')}</p>
      <div className="mt-8 grid w-full grid-cols-2 gap-3">
        {suggestions.map((s) => (
          <Card
            key={s}
            className="cursor-pointer border-border p-4 transition-colors hover:bg-accent"
            onClick={() => onSuggestion(s)}
          >
            <div className="flex items-start gap-3">
              <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-sm">{s}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === 'user';
  const t = useTranslations('chat');

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <Image
          src="/Robby.jpg"
          alt="Robby"
          width={32}
          height={32}
          className="mt-0.5 h-8 w-8 shrink-0 rounded-lg object-cover"
        />
      )}

      <div className={`max-w-[85%] space-y-2 ${isUser ? 'order-first' : ''}`}>
        {message.tools && message.tools.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.tools.map((tool, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                <Wrench className="h-3 w-3" />
                {TOOL_LABEL_KEYS[tool] ? t(`tools.${TOOL_LABEL_KEYS[tool]}`) : tool}
              </span>
            ))}
          </div>
        )}

        <div
          className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-foreground'
          }`}
        >
          {message.loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t('thinking')}</span>
            </div>
          ) : isUser ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <Markdown
                components={{
                  h2: ({ children }) => (
                    <h2 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="mb-1 mt-3 text-sm font-semibold first:mt-0">{children}</h3>
                  ),
                  ul: ({ children }) => (
                    <ul className="my-1 list-inside list-disc space-y-0.5 pl-1">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="my-1 list-inside list-decimal space-y-0.5 pl-1">{children}</ol>
                  ),
                  li: ({ children }) => <li className="text-sm">{children}</li>,
                  p: ({ children }) => <p className="my-1">{children}</p>,
                  strong: ({ children }) => (
                    <strong className="font-semibold text-foreground">{children}</strong>
                  ),
                  code: ({ children }) => (
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">{children}</code>
                  ),
                }}
              >
                {message.content}
              </Markdown>
            </div>
          )}
        </div>
      </div>

      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

function FormatTime({ ts }: { ts: number }) {
  const tc = useTranslations('common');
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return <>{tc('justNow')}</>;
  if (diffMin < 60) return <>{tc('minutesAgo', { minutes: diffMin })}</>;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return <>{tc('hoursAgo', { hours: diffHr })}</>;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return <>{tc('daysAgo', { days: diffDay })}</>;

  return <>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>;
}
