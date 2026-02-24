const STORAGE_KEYS = {
  credentials: 'os_credentials',
  sessionToken: 'os_session_token',
} as const;

const DB_NAME = 'os_keystore';
const DB_STORE = 'keys';
const CRYPTO_KEY_ID = 'cred_key';

export interface Credentials {
  appKey: string;
  appSecret: string;
  accessToken: string;
}

// ── AES-GCM encryption via Web Crypto API ───────────────

function openKeyStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getOrCreateKey(): Promise<CryptoKey> {
  const db = await openKeyStore();

  const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(CRYPTO_KEY_ID);
    req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
    req.onerror = () => reject(req.error);
  });

  if (existing) {
    db.close();
    return existing;
  }

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const req = tx.objectStore(DB_STORE).put(key, CRYPTO_KEY_ID);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  db.close();
  return key;
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipherBuf), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(base64: string): Promise<string> {
  const key = await getOrCreateKey();
  const raw = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const data = raw.slice(12);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(plainBuf);
}

// ── Credentials (encrypted in localStorage) ─────────────

export async function saveCredentials(creds: Credentials): Promise<void> {
  const cipher = await encrypt(JSON.stringify(creds));
  localStorage.setItem(STORAGE_KEYS.credentials, cipher);
}

export async function getCredentials(): Promise<Credentials | null> {
  const raw = localStorage.getItem(STORAGE_KEYS.credentials);
  if (!raw) return null;
  try {
    const json = await decrypt(raw);
    return JSON.parse(json) as Credentials;
  } catch {
    // Corrupted or key lost — clear stale data
    localStorage.removeItem(STORAGE_KEYS.credentials);
    return null;
  }
}

export function clearCredentials(): void {
  localStorage.removeItem(STORAGE_KEYS.credentials);
}

// ── Session token (plain — not sensitive, server-generated hash) ─

export function getSessionToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.sessionToken);
}

export function setSessionToken(token: string): void {
  localStorage.setItem(STORAGE_KEYS.sessionToken, token);
}

export function clearSessionToken(): void {
  localStorage.removeItem(STORAGE_KEYS.sessionToken);
}

export function isAuthenticated(): boolean {
  return !!getSessionToken();
}

export function logout(): void {
  clearCredentials();
  clearSessionToken();
}
