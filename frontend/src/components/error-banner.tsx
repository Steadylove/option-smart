'use client';

import { useTranslations } from 'next-intl';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorBannerProps {
  message: string;
  detail?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorBanner({ message, detail, onRetry, className }: ErrorBannerProps) {
  const t = useTranslations('common');

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm',
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
        <div>
          <p className="font-medium text-destructive">{message}</p>
          {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
        </div>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <RefreshCw className="h-3 w-3" />
          {t('retry')}
        </button>
      )}
    </div>
  );
}
