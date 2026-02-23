'use client';

import { useTranslations } from 'next-intl';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ComingSoonProps {
  icon: LucideIcon;
  phase: number;
}

export function ComingSoon({ icon: Icon, phase }: ComingSoonProps) {
  const t = useTranslations('learn');

  const features = [
    t('greeksGuide'),
    t('strategyPlaybook'),
    t('riskManagement'),
    t('ivConcepts'),
    t('realExamples'),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <Card className="border-border">
        <CardContent className="flex flex-col items-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-muted">
            <Icon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mt-6 text-lg font-semibold">{t('comingSoon')}</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            {t('comingSoonDesc', { phase })}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {features.map((f) => (
              <Badge key={f} variant="secondary" className="border border-border">
                {f}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
