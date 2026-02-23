'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  Link as LinkIcon,
  Briefcase,
  ShieldAlert,
  Bell,
  MessageSquare,
  BookOpen,
  Calendar,
  FileBarChart,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { LocaleSwitcher } from '@/components/locale-switcher';

type NavKey =
  | 'dashboard'
  | 'optionChain'
  | 'positions'
  | 'stressTest'
  | 'alerts'
  | 'aiAdvisor'
  | 'events'
  | 'review'
  | 'knowledge';

const navItems: { href: string; labelKey: NavKey; icon: typeof LayoutDashboard }[] = [
  { href: '/', labelKey: 'dashboard', icon: LayoutDashboard },
  { href: '/chain', labelKey: 'optionChain', icon: LinkIcon },
  { href: '/positions', labelKey: 'positions', icon: Briefcase },
  { href: '/risk', labelKey: 'stressTest', icon: ShieldAlert },
  { href: '/alerts', labelKey: 'alerts', icon: Bell },
  { href: '/chat', labelKey: 'aiAdvisor', icon: MessageSquare },
  { href: '/events', labelKey: 'events', icon: Calendar },
  { href: '/review', labelKey: 'review', icon: FileBarChart },
  { href: '/learn', labelKey: 'knowledge', icon: BookOpen },
];

export function Sidebar() {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const tSidebar = useTranslations('sidebar');

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex h-14 items-center gap-2.5 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
          <Activity className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-sm font-bold tracking-tight text-sidebar-foreground">
          {tSidebar('appName')}
        </span>
      </div>

      <Separator className="bg-border" />

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(({ href, labelKey, icon: Icon }) => {
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
              {t(labelKey)}
            </Link>
          );
        })}
      </nav>

      <Separator className="bg-border" />
      <div className="flex items-center justify-between px-5 py-3">
        <p className="text-[11px] text-muted-foreground">{tSidebar('tagline')}</p>
        <LocaleSwitcher />
      </div>
    </aside>
  );
}
