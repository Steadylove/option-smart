'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Activity, Eye, EyeOff, ExternalLink, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { isAuthenticated } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LocaleSwitcher } from '@/components/locale-switcher';

export default function LoginPage() {
  const t = useTranslations('login');
  const { connect, error } = useAuth();
  const router = useRouter();

  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace('/dashboard');
    } else {
      setReady(true);
    }
  }, [router]);

  const canSubmit = appKey.trim() && appSecret.trim() && accessToken.trim() && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    const ok = await connect({
      appKey: appKey.trim(),
      appSecret: appSecret.trim(),
      accessToken: accessToken.trim(),
    });
    if (ok) {
      router.replace('/dashboard');
    }
    setLoading(false);
  }

  if (!ready) return null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
            <Activity className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-sm font-bold tracking-tight">OptionSmart</span>
        </Link>
        <LocaleSwitcher />
      </header>

      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{t('description')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-4 rounded-xl border border-border bg-card p-6">
              <div className="space-y-2">
                <Label htmlFor="appKey">App Key</Label>
                <Input
                  id="appKey"
                  value={appKey}
                  onChange={(e) => setAppKey(e.target.value)}
                  placeholder={t('appKeyPlaceholder')}
                  autoComplete="off"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="appSecret">App Secret</Label>
                <div className="relative">
                  <Input
                    id="appSecret"
                    type={showSecret ? 'text' : 'password'}
                    value={appSecret}
                    onChange={(e) => setAppSecret(e.target.value)}
                    placeholder={t('appSecretPlaceholder')}
                    autoComplete="off"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="accessToken">Access Token</Label>
                <div className="relative">
                  <Input
                    id="accessToken"
                    type={showToken ? 'text' : 'password'}
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder={t('accessTokenPlaceholder')}
                    autoComplete="off"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={!canSubmit}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('connecting')}
                </>
              ) : (
                t('connect')
              )}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            {t('helpText')}{' '}
            <a
              href="https://open.longportapp.com/docs/getting-started"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {t('helpLink')}
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>

          <p className="text-center text-[11px] text-muted-foreground/60">{t('securityNote')}</p>
        </div>
      </div>
    </div>
  );
}
