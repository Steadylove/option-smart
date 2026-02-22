import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ComingSoonProps {
  title: string;
  description: string;
  icon: LucideIcon;
  phase: number;
  features: string[];
}

export function ComingSoon({ title, description, icon: Icon, phase, features }: ComingSoonProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      <Card className="border-border">
        <CardContent className="flex flex-col items-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-muted">
            <Icon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mt-6 text-lg font-semibold">Coming Soon</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            This feature is planned for development Phase {phase}.
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
