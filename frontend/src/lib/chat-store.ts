/**
 * Chat history persistence via localStorage.
 * Handles conversation CRUD, context window management,
 * and automatic compression for large contexts.
 */

import type { ChatMessage } from '@/lib/api';

const STORAGE_KEY = 'optionsmart-chat-history';
const MAX_CONVERSATIONS = 50;
const MAX_CONTEXT_MESSAGES = 20;

export interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  tools?: string[];
  loading?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: DisplayMessage[];
  createdAt: number;
  updatedAt: number;
}

function generateId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function autoTitle(messages: DisplayMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'New Chat';
  const text = firstUser.content.slice(0, 40);
  return text.length < firstUser.content.length ? `${text}...` : text;
}

export function loadConversations(): Conversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Conversation[];
  } catch {
    return [];
  }
}

function saveConversations(conversations: Conversation[]): void {
  const trimmed = conversations.slice(0, MAX_CONVERSATIONS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export function createConversation(): Conversation {
  const conv: Conversation = {
    id: generateId(),
    title: 'New Chat',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const all = loadConversations();
  all.unshift(conv);
  saveConversations(all);
  return conv;
}

export function updateConversation(id: string, messages: DisplayMessage[]): void {
  const all = loadConversations();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) return;

  all[idx].messages = messages.filter((m) => !m.loading);
  all[idx].updatedAt = Date.now();

  if (all[idx].title === 'New Chat' && messages.length > 0) {
    all[idx].title = autoTitle(messages);
  }

  // Move to top
  const [updated] = all.splice(idx, 1);
  all.unshift(updated);
  saveConversations(all);
}

export function deleteConversation(id: string): void {
  const all = loadConversations();
  saveConversations(all.filter((c) => c.id !== id));
}

export function clearAllConversations(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Build context messages for the API call.
 * If conversation is short, send everything.
 * If too long, compress older messages into a summary prefix.
 */
export function buildContextMessages(messages: DisplayMessage[]): ChatMessage[] {
  const completed = messages.filter((m) => !m.loading && m.content);
  const asChatMessages = completed.map((m) => ({ role: m.role, content: m.content }));

  if (asChatMessages.length <= MAX_CONTEXT_MESSAGES) {
    return asChatMessages;
  }

  // Keep recent messages in full, summarize older ones
  const keepRecent = 16;
  const older = asChatMessages.slice(0, asChatMessages.length - keepRecent);
  const recent = asChatMessages.slice(asChatMessages.length - keepRecent);

  const summaryLines: string[] = ['[Previous conversation context]'];
  for (const m of older) {
    if (m.role === 'user') {
      summaryLines.push(`User asked: ${m.content.slice(0, 100)}`);
    } else {
      const preview = m.content.slice(0, 150).replace(/\n/g, ' ');
      summaryLines.push(`Robby answered: ${preview}`);
    }
  }

  const contextMsg: ChatMessage = {
    role: 'user',
    content: summaryLines.join('\n'),
  };

  const ackMsg: ChatMessage = {
    role: 'assistant',
    content: 'Understood. I have the context from our previous conversation. Please continue.',
  };

  return [contextMsg, ackMsg, ...recent];
}
