'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, X, Check, Eye, EyeOff, Bot, Tag, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useSettings } from '@/hooks/use-swr-api';
import { cn } from '@/lib/utils';

const AI_PROVIDERS = [
  { id: 'glm', name: 'GLM (ZhipuAI)', model: 'GLM-4-Plus' },
  { id: 'deepseek', name: 'DeepSeek', model: 'DeepSeek-Chat' },
  { id: 'gemini', name: 'Gemini', model: 'Gemini 2.0 Flash' },
];

export default function SettingsPage() {
  const t = useTranslations('settings');
  const { data: settings, mutate } = useSettings();

  const [symbols, setSymbols] = useState<string[]>([]);
  const [newSymbol, setNewSymbol] = useState('');
  const [provider, setProvider] = useState('glm');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (settings) {
      setSymbols(settings.watched_symbols);
      setProvider(settings.ai_provider);
    }
  }, [settings]);

  function addSymbol() {
    const sym = newSymbol.trim().toUpperCase();
    if (!sym) return;
    const fullSym = sym.includes('.') ? sym : `${sym}.US`;
    if (!symbols.includes(fullSym)) {
      setSymbols([...symbols, fullSym]);
    }
    setNewSymbol('');
  }

  function removeSymbol(sym: string) {
    setSymbols(symbols.filter((s) => s !== sym));
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      await api.updateSettings({
        watched_symbols: symbols,
        ai_provider: provider,
        ...(apiKey ? { ai_api_key: apiKey } : {}),
      });
      await mutate();
      setSaved(true);
      setApiKey('');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </div>

      {/* Watched Symbols */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">{t('symbolsTitle')}</CardTitle>
          </div>
          <CardDescription>{t('symbolsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {symbols.map((sym) => (
              <Badge key={sym} variant="secondary" className="gap-1 px-3 py-1.5 text-sm">
                {sym.replace('.US', '')}
                <button
                  onClick={() => removeSymbol(sym)}
                  className="ml-1 rounded-sm hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {symbols.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('noSymbols')}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder={t('symbolPlaceholder')}
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSymbol())}
              className="max-w-xs"
            />
            <Button type="button" variant="outline" size="sm" onClick={addSymbol} className="gap-1">
              <Plus className="h-4 w-4" />
              {t('add')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* AI Model */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">{t('aiTitle')}</CardTitle>
          </div>
          <CardDescription>{t('aiDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {AI_PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => setProvider(p.id)}
                className={cn(
                  'rounded-lg border p-4 text-left transition-all',
                  provider === p.id
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border hover:border-primary/40',
                )}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'h-2 w-2 rounded-full',
                      provider === p.id ? 'bg-primary' : 'bg-muted-foreground/30',
                    )}
                  />
                  <span className="text-sm font-medium">{p.name}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{p.model}</p>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label>{t('apiKey')}</Label>
            <div className="relative max-w-md">
              <Input
                type={showKey ? 'text' : 'password'}
                placeholder={
                  settings?.ai_api_key_set ? settings.ai_api_key_masked : t('apiKeyPlaceholder')
                }
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{t('apiKeyHint')}</p>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving} className="min-w-[100px]">
          {saving ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              {t('saving')}
            </>
          ) : saved ? (
            <>
              <Check className="mr-1.5 h-4 w-4" />
              {t('saved')}
            </>
          ) : (
            t('save')
          )}
        </Button>
        {saved && <p className="text-sm text-green-500">{t('saveSuccess')}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
