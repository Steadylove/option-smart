'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Link as LinkIcon,
  Briefcase,
  MessageSquare,
  BookOpen,
  Calendar,
  FileBarChart,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/chain', label: 'Option Chain', icon: LinkIcon },
  { href: '/positions', label: 'Positions', icon: Briefcase },
  { href: '/chat', label: 'AI Advisor', icon: MessageSquare },
  { href: '/events', label: 'Events', icon: Calendar },
  { href: '/review', label: 'Review', icon: FileBarChart },
  { href: '/learn', label: 'Knowledge', icon: BookOpen },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex h-14 items-center gap-2.5 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
          <Activity className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-sm font-bold tracking-tight text-sidebar-foreground">
          OptionStrat
        </span>
      </div>

      <Separator className="bg-border" />

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <Separator className="bg-border" />
      <div className="px-5 py-3">
        <p className="text-[11px] text-muted-foreground">Theta Decay Machine</p>
      </div>
    </aside>
  );
}
