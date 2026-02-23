'use client';

import { useState } from 'react';
import { ShieldAlert, Loader2, Zap, BarChart3, Clock, Skull } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBanner } from '@/components/error-banner';
import { StressTestMatrix } from '@/components/stress-test-matrix';
import { api, type StressTestResponse, type StressTestRequest } from '@/lib/api';

type Mode = StressTestRequest['mode'];

const MODE_CONFIG: { mode: Mode; label: string; icon: typeof Zap; desc: string }[] = [
  { mode: 'price', label: 'Price Shock', icon: Zap, desc: 'Spot price ±3% to ±20%' },
  { mode: 'iv', label: 'IV Shock', icon: BarChart3, desc: 'Volatility -30% to +100%' },
  { mode: 'time', label: 'Time Decay', icon: Clock, desc: 'T+7 / T+14 / T+30' },
  { mode: 'composite', label: 'Worst Case', icon: Skull, desc: 'Combined crash scenarios' },
];

export default function RiskPage() {
  const [activeMode, setActiveMode] = useState<Mode>('price');
  const [data, setData] = useState<StressTestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Custom what-if state
  const [pricePct, setPricePct] = useState(0);
  const [ivPct, setIvPct] = useState(0);
  const [daysFwd, setDaysFwd] = useState(0);
  const [customData, setCustomData] = useState<StressTestResponse | null>(null);
  const [customLoading, setCustomLoading] = useState(false);

  async function runPreset(mode: Mode) {
    setActiveMode(mode);
    setLoading(true);
    setError('');
    try {
      const res = await api.stressTest({ mode });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stress test failed');
    } finally {
      setLoading(false);
    }
  }

  async function runCustom() {
    setCustomLoading(true);
    setError('');
    try {
      const res = await api.stressTest({
        mode: 'custom',
        custom_scenarios: [
          {
            name: `Spot ${pricePct >= 0 ? '+' : ''}${pricePct}%, IV ${ivPct >= 0 ? '+' : ''}${ivPct}%, T+${daysFwd}`,
            price_change_pct: pricePct,
            iv_change_pct: ivPct,
            days_forward: daysFwd,
          },
        ],
      });
      setCustomData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Custom scenario failed');
    } finally {
      setCustomLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10">
            <ShieldAlert className="h-5 w-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Stress Test</h1>
            <p className="text-sm text-muted-foreground">
              Simulate market scenarios to understand worst-case portfolio impact
            </p>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message="Stress test failed" detail={error} />}

      <Tabs defaultValue="presets" className="space-y-4">
        <TabsList>
          <TabsTrigger value="presets">Preset Scenarios</TabsTrigger>
          <TabsTrigger value="custom">Custom What-If</TabsTrigger>
        </TabsList>

        {/* Preset scenarios */}
        <TabsContent value="presets" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {MODE_CONFIG.map(({ mode, label, icon: Icon, desc }) => (
              <button
                key={mode}
                onClick={() => runPreset(mode)}
                disabled={loading}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  activeMode === mode && data
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40 hover:bg-accent'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">{label}</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{desc}</p>
              </button>
            ))}
          </div>

          {loading && (
            <Card className="border-border">
              <CardContent className="space-y-3 p-6">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-40 w-full" />
              </CardContent>
            </Card>
          )}

          {data && !loading && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <SummaryCard
                  label="Current P&L"
                  value={data.current_portfolio_pnl}
                  desc="All open positions"
                />
                {data.results.length > 0 && (
                  <>
                    <SummaryCard
                      label="Best Case"
                      value={Math.max(...data.results.map((r) => r.portfolio_pnl_change))}
                      desc={
                        data.results.reduce((a, b) =>
                          b.portfolio_pnl_change > a.portfolio_pnl_change ? b : a,
                        ).scenario.name
                      }
                    />
                    <SummaryCard
                      label="Worst Case"
                      value={Math.min(...data.results.map((r) => r.portfolio_pnl_change))}
                      desc={
                        data.results.reduce((a, b) =>
                          b.portfolio_pnl_change < a.portfolio_pnl_change ? b : a,
                        ).scenario.name
                      }
                    />
                    <SummaryCard
                      label="Max Drawdown"
                      value={
                        Math.min(...data.results.map((r) => r.portfolio_pnl)) -
                        data.current_portfolio_pnl
                      }
                      desc="From current level"
                    />
                  </>
                )}
              </div>

              {/* Matrix */}
              <div>
                <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
                  P&L Impact Matrix (change from current)
                </h2>
                <StressTestMatrix results={data.results} currentPnl={data.current_portfolio_pnl} />
              </div>
            </div>
          )}

          {!data && !loading && (
            <Card className="border-border">
              <CardContent className="flex flex-col items-center py-16 text-center">
                <ShieldAlert className="h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 text-sm font-medium text-muted-foreground">
                  Select a scenario type above to run stress tests
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Stress tests reprice all open positions under hypothetical market conditions
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Custom what-if */}
        <TabsContent value="custom" className="space-y-4">
          <Card className="border-border">
            <CardContent className="space-y-6 p-6">
              <div className="grid gap-6 md:grid-cols-3">
                <SliderInput
                  label="Spot Price Change"
                  value={pricePct}
                  onChange={setPricePct}
                  min={-30}
                  max={30}
                  step={1}
                  format={(v) => `${v >= 0 ? '+' : ''}${v}%`}
                />
                <SliderInput
                  label="IV Change"
                  value={ivPct}
                  onChange={setIvPct}
                  min={-50}
                  max={100}
                  step={5}
                  format={(v) => `${v >= 0 ? '+' : ''}${v}%`}
                />
                <SliderInput
                  label="Days Forward"
                  value={daysFwd}
                  onChange={setDaysFwd}
                  min={0}
                  max={60}
                  step={1}
                  format={(v) => `T+${v}`}
                />
              </div>

              <Button onClick={runCustom} disabled={customLoading} className="w-full sm:w-auto">
                {customLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="mr-2 h-4 w-4" />
                )}
                Run Scenario
              </Button>
            </CardContent>
          </Card>

          {customData && !customLoading && customData.results.length > 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <SummaryCard
                  label="Current P&L"
                  value={customData.current_portfolio_pnl}
                  desc="Before scenario"
                />
                <SummaryCard
                  label="Scenario P&L"
                  value={customData.results[0].portfolio_pnl}
                  desc="After scenario"
                />
                <SummaryCard
                  label="P&L Change"
                  value={customData.results[0].portfolio_pnl_change}
                  desc={customData.results[0].scenario.name}
                />
              </div>

              {/* Position detail table */}
              <Card className="overflow-hidden border-border p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-4 py-3">Position</th>
                      <th className="px-4 py-3 text-right">Current P&L</th>
                      <th className="px-4 py-3 text-right">Scenario P&L</th>
                      <th className="px-4 py-3 text-right">Change</th>
                      <th className="px-4 py-3 text-right">New Price</th>
                      <th className="px-4 py-3 text-right">New Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customData.results[0].positions.map((pr) => (
                      <tr key={pr.position_id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2.5 text-xs font-medium">{pr.label}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">
                          <span className={pr.current_pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {pr.current_pnl >= 0 ? '+' : ''}${pr.current_pnl.toFixed(0)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">
                          <span
                            className={pr.scenario_pnl >= 0 ? 'text-green-400' : 'text-red-400'}
                          >
                            {pr.scenario_pnl >= 0 ? '+' : ''}${pr.scenario_pnl.toFixed(0)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold">
                          <span className={pr.pnl_change >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {pr.pnl_change >= 0 ? '+' : ''}${pr.pnl_change.toFixed(0)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">
                          ${pr.scenario_price.toFixed(2)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">
                          {pr.scenario_delta.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({ label, value, desc }: { label: string; value: number; desc: string }) {
  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={`mt-1 text-xl font-bold ${value >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {value >= 0 ? '+' : ''}${value.toFixed(0)}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{desc}</p>
      </CardContent>
    </Card>
  );
}

function SliderInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-sm font-bold">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}
