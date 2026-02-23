'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { Locale } from '@/i18n/request';

function setLocaleCookie(locale: string) {
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}

export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations('locale');
  const router = useRouter();

  function switchTo(target: Locale) {
    if (target === locale) return;
    setLocaleCookie(target);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border bg-muted/50 p-0.5">
      {(['en', 'zh'] as const).map((l) => (
        <button
          key={l}
          onClick={() => switchTo(l)}
          className={cn(
            'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
            locale === l
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t(l)}
        </button>
      ))}
    </div>
  );
}
