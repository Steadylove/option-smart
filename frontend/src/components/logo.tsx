import Link from 'next/link';
import { Activity } from 'lucide-react';

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
        <Activity className="h-4.5 w-4.5 text-primary-foreground" />
      </div>
      <span className="text-base font-bold tracking-tight">OptionSmart</span>
    </Link>
  );
}
