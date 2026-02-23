/**
 * Chat display types and helpers.
 * Persistence is handled server-side; this module provides
 * client-side types and context window management.
 */

import type { ChatMessage } from '@/lib/api';

const MAX_CONTEXT_MESSAGES = 20;

export interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  tools?: string[];
  loading?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  pinned: boolean;
  messages: DisplayMessage[];
  pendingTaskId: string | null;
  createdAt: string;
  updatedAt: string;
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

  const contextMsg: ChatMessage = { role: 'user', content: summaryLines.join('\n') };
  const ackMsg: ChatMessage = {
    role: 'assistant',
    content: 'Understood. I have the context from our previous conversation. Please continue.',
  };

  return [contextMsg, ackMsg, ...recent];
}
