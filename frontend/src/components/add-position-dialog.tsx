'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, type PositionCreate } from '@/lib/api';

const SYMBOLS = ['TQQQ.US', 'TSLL.US', 'NVDL.US'];

interface AddPositionDialogProps {
  onCreated: () => void;
}

export function AddPositionDialog({ onCreated }: AddPositionDialogProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const t = useTranslations('addPosition');
  const tc = useTranslations('common');

  const strategies = [
    { value: 'csp', label: t('strategyCsp') },
    { value: 'cc', label: t('strategyCc') },
    { value: 'bull_put_spread', label: t('strategyBullPut') },
    { value: 'bear_call_spread', label: t('strategyBearCall') },
    { value: 'iron_condor', label: t('strategyIc') },
    { value: 'strangle', label: t('strategyStrangle') },
    { value: 'custom', label: t('strategyCustom') },
  ];

  const [form, setForm] = useState({
    symbol: 'TQQQ.US',
    option_symbol: '',
    option_type: 'put' as 'call' | 'put',
    direction: 'sell' as 'sell' | 'buy',
    strike: '',
    expiry: '',
    quantity: '1',
    open_price: '',
    open_date: new Date().toISOString().slice(0, 10),
    strategy: 'csp',
    notes: '',
  });

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.option_symbol || !form.strike || !form.expiry || !form.open_price) {
      setError(t('requiredFields'));
      return;
    }

    setSubmitting(true);
    try {
      const payload: PositionCreate = {
        symbol: form.symbol,
        option_symbol: form.option_symbol,
        option_type: form.option_type,
        direction: form.direction,
        strike: parseFloat(form.strike),
        expiry: form.expiry,
        quantity: parseInt(form.quantity, 10),
        open_price: parseFloat(form.open_price),
        open_date: form.open_date,
        strategy: form.strategy,
        notes: form.notes || undefined,
      };
      await api.createPosition(payload);
      setOpen(false);
      onCreated();
      setForm({
        symbol: 'TQQQ.US',
        option_symbol: '',
        option_type: 'put',
        direction: 'sell',
        strike: '',
        expiry: '',
        quantity: '1',
        open_price: '',
        open_date: new Date().toISOString().slice(0, 10),
        strategy: 'csp',
        notes: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('createFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          {t('addPosition')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="symbol">{t('underlying')}</Label>
              <select
                id="symbol"
                value={form.symbol}
                onChange={(e) => update('symbol', e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {SYMBOLS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('.US', '')}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="option_type">{t('type')}</Label>
              <div className="flex gap-1">
                {(['put', 'call'] as const).map((tp) => (
                  <button
                    key={tp}
                    type="button"
                    onClick={() => update('option_type', tp)}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                      form.option_type === tp
                        ? tp === 'put'
                          ? 'border-red-500/50 bg-red-500/10 text-red-400'
                          : 'border-green-500/50 bg-green-500/10 text-green-400'
                        : 'border-border bg-transparent text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {tp.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="direction">{t('direction')}</Label>
              <div className="flex gap-1">
                {(['sell', 'buy'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => update('direction', d)}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                      form.direction === d
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border bg-transparent text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {d.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="strategy">{t('strategy')}</Label>
              <select
                id="strategy"
                value={form.strategy}
                onChange={(e) => update('strategy', e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {strategies.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="option_symbol">{t('optionSymbol')}</Label>
            <Input
              id="option_symbol"
              placeholder={t('optionSymbolPlaceholder')}
              value={form.option_symbol}
              onChange={(e) => update('option_symbol', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="strike">{t('strikePrice')}</Label>
              <Input
                id="strike"
                type="number"
                step="0.01"
                placeholder={t('strikePlaceholder')}
                value={form.strike}
                onChange={(e) => update('strike', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expiry">{t('expiryDate')}</Label>
              <Input
                id="expiry"
                type="date"
                value={form.expiry}
                onChange={(e) => update('expiry', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="quantity">{t('quantity')}</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={form.quantity}
                onChange={(e) => update('quantity', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="open_price">{t('openPrice')}</Label>
              <Input
                id="open_price"
                type="number"
                step="0.01"
                placeholder={t('openPricePlaceholder')}
                value={form.open_price}
                onChange={(e) => update('open_price', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="open_date">{t('openDate')}</Label>
            <Input
              id="open_date"
              type="date"
              value={form.open_date}
              onChange={(e) => update('open_date', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">{t('notes')}</Label>
            <Input
              id="notes"
              placeholder={t('notesPlaceholder')}
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t('creating') : t('createPosition')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
