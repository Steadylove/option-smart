'use client';

import { useState } from 'react';
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
const STRATEGIES = [
  { value: 'csp', label: 'Cash-Secured Put' },
  { value: 'cc', label: 'Covered Call' },
  { value: 'bull_put_spread', label: 'Bull Put Spread' },
  { value: 'bear_call_spread', label: 'Bear Call Spread' },
  { value: 'iron_condor', label: 'Iron Condor' },
  { value: 'strangle', label: 'Strangle' },
  { value: 'custom', label: 'Custom' },
];

interface AddPositionDialogProps {
  onCreated: () => void;
}

export function AddPositionDialog({ onCreated }: AddPositionDialogProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
      setError('Please fill in all required fields');
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
      setError(err instanceof Error ? err.message : 'Failed to create position');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add Position
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add New Position</DialogTitle>
          <DialogDescription>
            Manually record an option position for tracking and analysis.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4 py-2">
          {/* Row 1: Symbol + Option Type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="symbol">Underlying</Label>
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
              <Label htmlFor="option_type">Type</Label>
              <div className="flex gap-1">
                {(['put', 'call'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => update('option_type', t)}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                      form.option_type === t
                        ? t === 'put'
                          ? 'border-red-500/50 bg-red-500/10 text-red-400'
                          : 'border-green-500/50 bg-green-500/10 text-green-400'
                        : 'border-border bg-transparent text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Direction + Strategy */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="direction">Direction</Label>
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
              <Label htmlFor="strategy">Strategy</Label>
              <select
                id="strategy"
                value={form.strategy}
                onChange={(e) => update('strategy', e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {STRATEGIES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 3: Option Symbol */}
          <div className="space-y-1.5">
            <Label htmlFor="option_symbol">Option Symbol *</Label>
            <Input
              id="option_symbol"
              placeholder="e.g. TQQQ250321P00060000.US"
              value={form.option_symbol}
              onChange={(e) => update('option_symbol', e.target.value)}
            />
          </div>

          {/* Row 4: Strike + Expiry */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="strike">Strike Price *</Label>
              <Input
                id="strike"
                type="number"
                step="0.01"
                placeholder="60.00"
                value={form.strike}
                onChange={(e) => update('strike', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expiry">Expiry Date *</Label>
              <Input
                id="expiry"
                type="date"
                value={form.expiry}
                onChange={(e) => update('expiry', e.target.value)}
              />
            </div>
          </div>

          {/* Row 5: Quantity + Open Price */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={form.quantity}
                onChange={(e) => update('quantity', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="open_price">Open Price *</Label>
              <Input
                id="open_price"
                type="number"
                step="0.01"
                placeholder="1.50"
                value={form.open_price}
                onChange={(e) => update('open_price', e.target.value)}
              />
            </div>
          </div>

          {/* Row 6: Open Date */}
          <div className="space-y-1.5">
            <Label htmlFor="open_date">Open Date</Label>
            <Input
              id="open_date"
              type="date"
              value={form.open_date}
              onChange={(e) => update('open_date', e.target.value)}
            />
          </div>

          {/* Row 7: Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              placeholder="Optional notes about this position..."
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Position'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
