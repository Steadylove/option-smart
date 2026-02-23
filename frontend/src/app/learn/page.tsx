'use client';

import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PayoffChart } from '@/components/learn/payoff-chart';
import { GreeksGuide } from '@/components/learn/greeks-guide';
import { SellerTips } from '@/components/learn/seller-tips';

export default function LearnPage() {
  const t = useTranslations('learn');

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <Tabs defaultValue="strategies">
        <TabsList variant="line">
          <TabsTrigger value="strategies">{t('tabStrategies')}</TabsTrigger>
          <TabsTrigger value="greeks">{t('tabGreeks')}</TabsTrigger>
          <TabsTrigger value="tips">{t('tabTips')}</TabsTrigger>
        </TabsList>

        <TabsContent value="strategies" className="pt-4">
          <PayoffChart />
        </TabsContent>

        <TabsContent value="greeks" className="pt-4">
          <GreeksGuide />
        </TabsContent>

        <TabsContent value="tips" className="pt-4">
          <SellerTips />
        </TabsContent>
      </Tabs>
    </div>
  );
}
