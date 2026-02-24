'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  type Credentials,
  getCredentials,
  getSessionToken,
  logout as clearAuth,
  saveCredentials,
  setSessionToken,
} from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const connect = useCallback(async (creds: Credentials): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_key: creds.appKey,
          app_secret: creds.appSecret,
          access_token: creds.accessToken,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Connection failed (${res.status})`);
      }
      const { token } = await res.json();
      await saveCredentials(creds);
      setSessionToken(token);
      setStatus('authenticated');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('unauthenticated');
      return false;
    }
  }, []);

  const disconnect = useCallback(async () => {
    const token = getSessionToken();
    if (token) {
      fetch(`${API_BASE}/api/auth/disconnect`, {
        method: 'POST',
        headers: { 'X-Session-Token': token },
      }).catch(() => {});
    }
    clearAuth();
    setStatus('unauthenticated');
    router.push('/login');
  }, [router]);

  // On mount: auto-reconnect if credentials exist
  useEffect(() => {
    async function init() {
      const token = getSessionToken();
      const creds = await getCredentials();

      if (!creds) {
        setStatus('unauthenticated');
        return;
      }

      if (token) {
        try {
          const res = await fetch(`${API_BASE}/api/auth/verify`, {
            headers: { 'X-Session-Token': token },
          });
          if (res.ok) {
            setStatus('authenticated');
            return;
          }
        } catch {}
        await connect(creds);
      } else {
        await connect(creds);
      }
    }
    init();
  }, [connect]);

  return { status, error, connect, disconnect };
}
