'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  ArrowRight,
  BarChart3,
  Brain,
  ChevronDown,
  LineChart,
  Shield,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Logo } from '@/components/logo';
import {
  PreviewOptionChain,
  PreviewGreeks,
  PreviewAiChat,
  PreviewStressTest,
  PreviewPositions,
  PreviewAlerts,
} from '@/components/landing-previews';

const marqueeCards = [
  { label: 'Option Chain', Preview: PreviewOptionChain },
  { label: 'Greeks Dashboard', Preview: PreviewGreeks },
  { label: 'AI Advisor', Preview: PreviewAiChat },
  { label: 'Stress Test', Preview: PreviewStressTest },
  { label: 'Positions', Preview: PreviewPositions },
  { label: 'Smart Alerts', Preview: PreviewAlerts },
];

function useRevealOnScroll() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.15 },
    );

    el.querySelectorAll('.reveal').forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, []);

  return ref;
}

function useSnapWheel(containerRef: React.RefObject<HTMLDivElement | null>) {
  const isScrolling = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (isScrolling.current) return;

      const sections = el.querySelectorAll<HTMLElement>(':scope > section');
      const currentIdx = Math.round(el.scrollTop / el.clientHeight);
      const nextIdx =
        e.deltaY > 0 ? Math.min(currentIdx + 1, sections.length - 1) : Math.max(currentIdx - 1, 0);

      if (nextIdx === currentIdx) return;

      isScrolling.current = true;
      sections[nextIdx].scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => {
        isScrolling.current = false;
      }, 800);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [containerRef]);
}

function MarqueeCard({ item }: { item: (typeof marqueeCards)[number] }) {
  const { Preview, label } = item;
  return (
    <div className="mx-3 w-[420px] shrink-0 overflow-hidden rounded-xl border border-border/40 shadow-lg shadow-black/20">
      <Preview />
      <div className="bg-card/80 px-4 py-2 text-center text-xs font-medium text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const t = useTranslations('landing');
  const revealRef = useRevealOnScroll();
  useSnapWheel(revealRef);

  const features = [
    { icon: LineChart, titleKey: 'featureChain', descKey: 'featureChainDesc' },
    { icon: BarChart3, titleKey: 'featureGreeks', descKey: 'featureGreeksDesc' },
    { icon: Brain, titleKey: 'featureAi', descKey: 'featureAiDesc' },
    { icon: Shield, titleKey: 'featureStress', descKey: 'featureStressDesc' },
    { icon: TrendingUp, titleKey: 'featurePositions', descKey: 'featurePositionsDesc' },
    { icon: Zap, titleKey: 'featureAlerts', descKey: 'featureAlertsDesc' },
  ] as const;

  return (
    <div className="bg-background h-screen overflow-y-auto snap-y snap-mandatory" ref={revealRef}>
      {/* ── Hero: full viewport ────────────────────────── */}
      <section className="relative flex h-screen snap-start flex-col">
        {/* Navbar */}
        <header className="animate-fade-in flex items-center justify-between px-6 py-4 lg:px-12">
          <Logo />
          <LocaleSwitcher />
        </header>

        {/* Hero content */}
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center lg:px-12">
          <div className="mx-auto max-w-3xl space-y-6">
            <div
              className="animate-fade-in-up inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-4 py-1.5 text-xs font-medium text-muted-foreground"
              style={{ animationDelay: '0.1s' }}
            >
              <Zap className="h-3.5 w-3.5 text-primary" />
              {t('badge')}
            </div>

            <h1
              className="animate-fade-in-up text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl"
              style={{ animationDelay: '0.25s' }}
            >
              {t('heroTitle')}
            </h1>

            <p
              className="animate-fade-in-up mx-auto max-w-xl text-lg text-muted-foreground"
              style={{ animationDelay: '0.4s' }}
            >
              {t('heroDesc')}
            </p>

            <div
              className="animate-fade-in-up flex items-center justify-center gap-4 pt-2"
              style={{ animationDelay: '0.55s' }}
            >
              <Link href="/login">
                <Button size="lg" className="gap-2">
                  {t('ctaStart')}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        <button
          onClick={() =>
            document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
          }
          className="animate-fade-in absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 cursor-pointer"
          style={{ animationDelay: '1s' }}
        >
          <span className="text-[11px] text-muted-foreground/60 tracking-wide uppercase">
            Scroll
          </span>
          <ChevronDown className="h-6 w-6 animate-bounce text-muted-foreground" />
        </button>
      </section>

      {/* ── Features + Footer: second full page ─────── */}
      <section id="features" className="flex h-screen snap-start flex-col border-t border-border">
        <div className="flex flex-1 flex-col justify-center px-6 py-16 lg:px-12">
          <div className="mx-auto max-w-6xl">
            <h2 className="reveal mb-12 text-center text-2xl font-bold tracking-tight">
              {t('featuresTitle')}
            </h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, titleKey, descKey }, i) => (
                <div
                  key={titleKey}
                  className="reveal rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/30"
                  style={{ transitionDelay: `${i * 80}ms` }}
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mb-1.5 text-sm font-semibold">{t(titleKey)}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{t(descKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <footer className="border-t border-border px-6 py-4 text-center text-xs text-muted-foreground lg:px-12">
          {t('footer')}
        </footer>
      </section>
    </div>
  );
}
