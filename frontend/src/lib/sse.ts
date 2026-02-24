import { getSessionToken } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface SseCallbacks {
  onText: (text: string) => void;
  onTool: (tools: string[]) => void;
  onThinking?: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export async function streamPostSse(
  path: string,
  body: Record<string, unknown>,
  callbacks: SseCallbacks,
  signal?: AbortSignal,
) {
  let res: Response;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getSessionToken();
    if (token) headers['X-Session-Token'] = token;

    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    callbacks.onError(String(err));
    return;
  }

  if (!res.ok || !res.body) {
    callbacks.onError(`API error ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        if (!part.trim()) continue;
        const lines = part.split('\n');
        if (lines.every((l) => l.startsWith(': ') || l === '')) continue;

        const isToolEvent = lines.some((l) => l.startsWith('event: tool'));
        const isThinkingEvent = lines.some((l) => l.startsWith('event: thinking'));
        const dataLines = lines
          .filter((l) => l.startsWith('data:'))
          .map((l) => (l.startsWith('data: ') ? l.slice(6) : l.slice(5)));
        if (!dataLines.length) continue;

        const payload = dataLines.join('\n');
        if (payload === '[DONE]') {
          callbacks.onDone();
          return;
        }

        if (isToolEvent || payload.startsWith('[TOOL:')) {
          const toolStr = payload.replace('[TOOL:', '').replace(']', '');
          callbacks.onTool(toolStr.split(',').filter(Boolean));
        } else if (isThinkingEvent) {
          callbacks.onThinking?.(payload);
        } else {
          callbacks.onText(payload);
        }
      }
    }
    callbacks.onDone();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return;
    }
    callbacks.onError(String(err));
  } finally {
    reader.releaseLock();
  }
}
