'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  User,
  Loader2,
  Plus,
  Wrench,
  MessageSquare,
  Trash2,
  Clock,
  Pencil,
  Pin,
  PinOff,
  Check,
  X,
  Brain,
  ChevronDown,
  Square,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';
import type { ConversationOut } from '@/lib/api';
import type { Conversation, DisplayMessage } from '@/lib/chat-store';

const TOOL_LABEL_KEYS: Record<string, string> = {
  get_portfolio_overview: 'portfolioOverview',
  get_position_list: 'positionList',
  get_position_detail: 'positionDetail',
  get_stock_quote: 'stockQuote',
  run_stress_test: 'stressTest',
  get_decision_matrix: 'decisionMatrix',
  get_alerts: 'alerts',
  search_market_news: 'marketNews',
  get_upcoming_events: 'upcomingEvents',
  get_economic_calendar: 'economicCalendar',
  analyze_price_change: 'priceChange',
  assess_event_impact: 'eventImpact',
};

// ── Helpers ─────────────────────────────────────────────

function apiToConversation(c: ConversationOut): Conversation {
  return {
    id: c.id,
    title: c.title,
    pinned: c.pinned,
    messages: c.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      thinking: m.thinking || undefined,
      tools: m.tools || undefined,
    })),
    pendingTaskId: c.pending_task_id,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

// ── SSE parsing helper ──────────────────────────────────

function parseSseBuffer(
  buffer: string,
  acc: { text: string; thinking: string; tools: string[] },
  setMessages: React.Dispatch<React.SetStateAction<DisplayMessage[]>>,
): string {
  const parts = buffer.split('\n\n');
  const remaining = parts.pop() || '';

  for (const part of parts) {
    const lines = part.split('\n');
    if (lines.every((l) => l.startsWith(': ') || l === '')) continue;

    const isToolEvent = lines.some((l) => l.startsWith('event: tool'));
    const isThinkingEvent = lines.some((l) => l.startsWith('event: thinking'));
    const dataLines = lines.filter((l) => l.startsWith('data: ')).map((l) => l.slice(6));
    if (!dataLines.length) continue;

    const payload = dataLines.join('\n');
    if (payload === '[DONE]') continue;

    if (isToolEvent || payload.startsWith('[TOOL:')) {
      const toolStr = payload.replace('[TOOL:', '').replace(']', '');
      acc.tools.push(...toolStr.split(',').filter(Boolean));
      const toolsCopy = [...acc.tools];
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = { ...last, tools: toolsCopy };
        }
        return updated;
      });
      continue;
    }

    if (isThinkingEvent) {
      acc.thinking += payload;
      const thinking = acc.thinking;
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = { ...last, thinking, loading: true };
        }
        return updated;
      });
      continue;
    }

    acc.text += payload;
    const content = acc.text;
    const thinking = acc.thinking || undefined;
    const tools = acc.tools.length > 0 ? [...acc.tools] : undefined;
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.role === 'assistant') {
        updated[updated.length - 1] = { ...last, content, thinking, loading: false, tools };
      }
      return updated;
    });
  }

  return remaining;
}

// ── Main component ──────────────────────────────────────

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [deepThinking, setDeepThinking] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const t = useTranslations('chat');

  // ── Data fetching ───────────────────────────────────

  const refreshConversations = useCallback(async () => {
    try {
      const data = await api.listConversations();
      setConversations(data.conversations.map(apiToConversation));
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }, []);

  // Stream SSE from a background task
  const streamFromTask = useCallback(async (taskId: string, signal: AbortSignal) => {
    const resp = await api.streamChatTask(taskId, signal);
    const reader = resp.body?.getReader();
    if (!reader) throw new Error('No stream reader');

    const decoder = new TextDecoder();
    const acc = { text: '', thinking: '', tools: [] as string[] };
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = parseSseBuffer(buffer, acc, setMessages);
      }
    } finally {
      reader.releaseLock();
    }

    setMessages((prev) => prev.map((m) => (m.loading ? { ...m, loading: false } : m)));
  }, []);

  // Recover a conversation with a pending backend task
  const recoverTask = useCallback(
    async (conv: Conversation) => {
      if (!conv.pendingTaskId) return;

      setIsStreaming(true);
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const task = await api.getChatTask(conv.pendingTaskId);

        if (task.status === 'done' || task.status === 'error') {
          // Already finished — reload from server (result was persisted)
          await refreshConversations();
          const fresh = await api.getConversation(conv.id);
          const freshConv = apiToConversation(fresh);
          setMessages(freshConv.messages);
        } else {
          // Still running — add loading placeholder, reconnect stream
          const msgs: DisplayMessage[] = [
            ...conv.messages,
            { role: 'assistant', content: '', loading: true },
          ];
          setMessages(msgs);
          await streamFromTask(conv.pendingTaskId, ac.signal);
          // Reload from server after stream completes
          await refreshConversations();
          const fresh = await api.getConversation(conv.id);
          setMessages(apiToConversation(fresh).messages);
        }
      } catch {
        if (ac.signal.aborted) return;
        setMessages(conv.messages);
      } finally {
        if (abortRef.current === ac) {
          setIsStreaming(false);
          abortRef.current = null;
        }
      }
    },
    [refreshConversations, streamFromTask],
  );

  // Initial load + auto-recover pending tasks
  useEffect(() => {
    (async () => {
      try {
        const data = await api.listConversations();
        const convs = data.conversations.map(apiToConversation);
        setConversations(convs);

        if (convs.length > 0) {
          const first = convs[0];
          setActiveId(first.id);
          setMessages(first.messages);
          if (first.pendingTaskId) {
            recoverTask(first);
          }
        }
      } catch (err) {
        console.error('Failed to init conversations:', err);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  useEffect(scrollToBottom, [messages, scrollToBottom]);

  // ── Actions ─────────────────────────────────────────

  const handleNewChat = useCallback(async () => {
    try {
      const conv = await api.createConversation();
      const c = apiToConversation(conv);
      setActiveId(c.id);
      setMessages([]);
      await refreshConversations();
      inputRef.current?.focus();
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  }, [refreshConversations]);

  const handleSelectChat = useCallback(
    async (id: string) => {
      if (isStreaming) return;
      abortRef.current?.abort();
      abortRef.current = null;

      setActiveId(id);
      const conv = conversations.find((c) => c.id === id);
      if (conv) {
        setMessages(conv.messages);
        if (conv.pendingTaskId) {
          recoverTask(conv);
        }
      }
    },
    [isStreaming, conversations, recoverTask],
  );

  const handleDeleteChat = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await api.deleteConversation(id);
        await refreshConversations();
        if (activeId === id) {
          const data = await api.listConversations();
          const convs = data.conversations.map(apiToConversation);
          if (convs.length > 0) {
            setActiveId(convs[0].id);
            setMessages(convs[0].messages);
          } else {
            setActiveId(null);
            setMessages([]);
          }
        }
      } catch (err) {
        console.error('Failed to delete conversation:', err);
      }
    },
    [activeId, refreshConversations],
  );

  const handleStartRename = useCallback((id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(id);
    setRenameValue(title);
  }, []);

  const handleConfirmRename = useCallback(async () => {
    if (renamingId && renameValue.trim()) {
      try {
        await api.updateConversation(renamingId, { title: renameValue.trim() });
        await refreshConversations();
      } catch (err) {
        console.error('Rename failed:', err);
      }
    }
    setRenamingId(null);
  }, [renamingId, renameValue, refreshConversations]);

  const handleCancelRename = useCallback(() => {
    setRenamingId(null);
  }, []);

  const handleTogglePin = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const conv = conversations.find((c) => c.id === id);
      if (!conv) return;
      try {
        await api.updateConversation(id, { pinned: !conv.pinned });
        await refreshConversations();
      } catch (err) {
        console.error('Pin toggle failed:', err);
      }
    },
    [conversations, refreshConversations],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      let currentId = activeId;
      if (!currentId) {
        try {
          const conv = await api.createConversation();
          currentId = conv.id;
          setActiveId(currentId);
          await refreshConversations();
        } catch (err) {
          console.error('Failed to create conversation:', err);
          return;
        }
      }

      const userMsg: DisplayMessage = { role: 'user', content: text.trim() };
      const assistantMsg: DisplayMessage = { role: 'assistant', content: '', loading: true };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput('');
      setIsStreaming(true);

      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const { task_id } = await api.sendChatMessage(currentId, text.trim(), deepThinking);

        // Title is generated in parallel on server (glm-4-flash, <1s)
        setTimeout(() => refreshConversations(), 1500);

        // Stream AI response in real-time (SSE)
        await streamFromTask(task_id, ac.signal);

        // After stream completes, reload final state
        await refreshConversations();
        const fresh = await api.getConversation(currentId);
        setMessages(apiToConversation(fresh).messages);
      } catch (err) {
        if (ac.signal.aborted) return;
        console.error('Chat error:', err);
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              content: t('connectionError'),
              loading: false,
            };
          }
          return updated;
        });
      } finally {
        if (abortRef.current === ac) {
          setIsStreaming(false);
          abortRef.current = null;
        }
      }
    },
    [activeId, isStreaming, deepThinking, refreshConversations, streamFromTask, t],
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
    <div className="flex h-full">
      <div className="flex w-72 shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold">{t('chats')}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNewChat}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <Separator />
        <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block! [&_[data-slot=scroll-area-viewport]>div]:min-w-0!">
          <div className="p-2">
            {conversations.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                {t('noConversations')}
              </p>
            ) : (
              conversations.map((conv) => {
                const isActive = activeId === conv.id;
                const isRenaming = renamingId === conv.id;
                const showActions = isActive || isRenaming;
                return (
                  <div
                    key={conv.id}
                    onClick={() => !isRenaming && handleSelectChat(conv.id)}
                    className={`group flex cursor-pointer items-center gap-2 overflow-hidden rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {conv.pinned ? (
                      <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : (
                      <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      {isRenaming ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleConfirmRename();
                            if (e.key === 'Escape') handleCancelRename();
                          }}
                          onBlur={handleConfirmRename}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-sm leading-tight outline-none focus:ring-1 focus:ring-ring"
                        />
                      ) : (
                        <p className="truncate text-sm leading-tight">{conv.title}</p>
                      )}
                      <p className="mt-0.5 flex items-center gap-1 text-[10px] opacity-60">
                        <Clock className="h-2.5 w-2.5" />
                        <FormatTime ts={conv.updatedAt} />
                      </p>
                    </div>
                    <div
                      className={`mt-0.5 shrink-0 items-center gap-0.5 ${
                        showActions ? 'flex' : 'hidden group-hover:flex'
                      }`}
                    >
                      {isRenaming ? (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleConfirmRename();
                            }}
                            className="rounded p-0.5 hover:bg-muted"
                          >
                            <Check className="h-3 w-3 text-emerald-400" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelRename();
                            }}
                            className="rounded p-0.5 hover:bg-muted"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={(e) => handleStartRename(conv.id, conv.title, e)}
                            className="rounded p-0.5 hover:bg-muted"
                            title={t('rename')}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={(e) => handleTogglePin(conv.id, e)}
                            className="rounded p-0.5 hover:bg-muted"
                            title={conv.pinned ? t('unpin') : t('pin')}
                          >
                            {conv.pinned ? (
                              <PinOff className="h-3 w-3" />
                            ) : (
                              <Pin className="h-3 w-3" />
                            )}
                          </button>
                          <button
                            onClick={(e) => handleDeleteChat(conv.id, e)}
                            className="rounded p-0.5 hover:bg-destructive/20"
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex flex-1 flex-col py-3">
        <div ref={scrollRef} className="flex-1 overflow-y-auto py-4">
          {messages.length === 0 ? (
            <EmptyState suggestions={suggestions} onSuggestion={sendMessage} />
          ) : (
            <div className="mx-auto max-w-4xl space-y-6 px-6">
              {messages.map((msg, idx) => (
                <MessageBubble key={idx} message={msg} />
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 pt-4 pb-2">
          <div className="mx-auto max-w-4xl px-2">
            <div className="relative flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('placeholder')}
                rows={1}
                className="w-full resize-none rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                style={{ minHeight: '44px', maxHeight: '120px' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                }}
              />
              {!isStreaming && (
                <Button
                  size="icon"
                  variant={deepThinking ? 'default' : 'outline'}
                  onClick={() => setDeepThinking((v) => !v)}
                  className="h-11 w-11 shrink-0"
                  title={t(deepThinking ? 'deepThinkingOn' : 'deepThinkingOff')}
                >
                  <Brain className="h-4 w-4" />
                </Button>
              )}
              {isStreaming ? (
                <Button
                  size="icon"
                  variant="destructive"
                  onClick={() => {
                    abortRef.current?.abort();
                    abortRef.current = null;
                    setIsStreaming(false);
                  }}
                  className="h-11 w-11 shrink-0"
                >
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim()}
                  className="h-11 w-11 shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              {deepThinking ? t('poweredByDeep') : t('poweredBy')}
            </p>
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

      <div className={`space-y-2 ${isUser ? 'order-first max-w-[85%]' : 'w-[60%]'}`}>
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

        {message.thinking && <ThinkingBlock content={message.thinking} loading={message.loading} />}

        <div
          className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-foreground'
          } ${message.loading && message.thinking && !message.content ? 'hidden' : ''}`}
        >
          {message.loading && !message.content && !message.thinking ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t('thinking')}</span>
            </div>
          ) : isUser ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <Markdown
                remarkPlugins={[remarkGfm]}
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
                  table: ({ children }) => (
                    <div className="my-2 overflow-x-auto">
                      <table className="w-full border-collapse text-sm">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className="border-b border-border bg-muted/50">{children}</thead>
                  ),
                  th: ({ children }) => (
                    <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="border-b border-border/50 px-3 py-1.5">{children}</td>
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

function FormatTime({ ts }: { ts: string }) {
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

function ThinkingBlock({ content, loading }: { content: string; loading?: boolean }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('chat');

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <Brain className="h-3.5 w-3.5" />
        <span className="flex-1 text-left font-medium">
          {loading ? t('deepThinking') : t('deepThinkingDone')}
        </span>
        {loading && <Loader2 className="h-3 w-3 animate-spin" />}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-border/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground/80">
          <pre className="whitespace-pre-wrap font-sans">{content}</pre>
        </div>
      )}
    </div>
  );
}
