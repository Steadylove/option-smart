'use client';

import { useState } from 'react';
import { Bell, AlertTriangle, CheckCircle, Info, ChevronRight, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAlerts } from '@/hooks/use-swr-api';
import type { AlertOut } from '@/lib/api';

const LEVEL_CONFIG = {
  critical: {
    icon: AlertTriangle,
    color: 'text-red-500',
    bg: 'bg-red-500/10 border-red-500/20',
    badge: 'bg-red-500/15 text-red-600 border-red-500/30',
    label: 'Critical',
  },
  warning: {
    icon: Bell,
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10 border-yellow-500/20',
    badge: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
    label: 'Warning',
  },
  info: {
    icon: Info,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10 border-blue-500/20',
    badge: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
    label: 'Info',
  },
} as const;

type FilterLevel = 'all' | 'critical' | 'warning' | 'info';

export default function AlertsPage() {
  const { data, isLoading, mutate } = useAlerts();
  const [filter, setFilter] = useState<FilterLevel>('all');

  const alerts = data?.alerts ?? [];
  const filtered = filter === 'all' ? alerts : alerts.filter((a) => a.level === filter);

  const counts = {
    critical: alerts.filter((a) => a.level === 'critical').length,
    warning: alerts.filter((a) => a.level === 'warning').length,
    info: alerts.filter((a) => a.level === 'info').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time position monitoring and risk alerts
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => mutate()} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard
          label="Critical"
          count={counts.critical}
          color="text-red-500"
          bg="bg-red-500/10"
        />
        <SummaryCard
          label="Warning"
          count={counts.warning}
          color="text-yellow-500"
          bg="bg-yellow-500/10"
        />
        <SummaryCard label="Info" count={counts.info} color="text-blue-500" bg="bg-blue-500/10" />
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'critical', 'warning', 'info'] as const).map((level) => (
          <Button
            key={level}
            variant={filter === level ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(level)}
          >
            {level === 'all' ? `All (${alerts.length})` : `${level} (${counts[level]})`}
          </Button>
        ))}
      </div>

      {/* Alert list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-500" />
            <h3 className="mt-4 font-semibold">All Clear</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {alerts.length === 0
                ? 'No active alerts. Your portfolio looks healthy.'
                : 'No alerts matching this filter.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((alert, idx) => (
            <AlertCard key={`${alert.position_id}-${alert.type}-${idx}`} alert={alert} />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  count,
  color,
  bg,
}: {
  label: string;
  count: number;
  color: string;
  bg: string;
}) {
  return (
    <Card className="border-border">
      <CardContent className="flex items-center gap-4 py-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${bg}`}>
          <span className={`text-lg font-bold ${color}`}>{count}</span>
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">active alerts</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AlertCard({ alert }: { alert: AlertOut }) {
  const config = LEVEL_CONFIG[alert.level] || LEVEL_CONFIG.info;
  const Icon = config.icon;

  return (
    <Card className={`border ${config.bg} transition-colors`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${config.color}`} />
            <div>
              <CardTitle className="text-sm font-semibold">{alert.title}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
            </div>
          </div>
          <Badge variant="outline" className={`shrink-0 text-xs ${config.badge}`}>
            {config.label}
          </Badge>
        </div>
      </CardHeader>
      {alert.suggested_action && (
        <CardContent className="pt-0 pb-3">
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">{alert.suggested_action}</span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
