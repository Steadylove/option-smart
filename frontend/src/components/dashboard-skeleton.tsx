'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }, (_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div className="space-y-2">
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
              <div className="space-y-2 text-right">
                <Skeleton className="h-3 w-14 ml-auto" />
                <Skeleton className="h-6 w-12 ml-auto" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ChainSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
