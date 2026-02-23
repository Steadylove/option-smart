'use client';

import { useLocale } from 'next-intl';
import { TrendingUp, Zap, Clock, BarChart3, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface GreekDef {
  icon: LucideIcon;
  color: string;
  accent: string;
  en: { name: string; symbol: string; analogy: string; tips: string[]; insight: string };
  zh: { name: string; symbol: string; analogy: string; tips: string[]; insight: string };
}

const GREEKS: GreekDef[] = [
  {
    icon: TrendingUp,
    color: 'text-blue-400',
    accent: 'border-blue-500/30 bg-blue-500/5',
    en: {
      name: 'Delta',
      symbol: 'Δ',
      analogy: 'Steering wheel — price sensitivity to underlying',
      tips: [
        '|Δ| < 0.30 → safe OTM zone for sellers',
        'Δ ≈ prob of finishing ITM at expiry',
        'Sell put Δ is negative: stock up = you win',
      ],
      insight: 'Target |Δ| 0.15–0.30 for best risk/reward as a seller.',
    },
    zh: {
      name: 'Delta',
      symbol: 'Δ',
      analogy: '方向盘 — 期权价格对标的价格的敏感度',
      tips: [
        '|Δ| < 0.30 → 卖方较安全的虚值区间',
        'Δ ≈ 到期时变为实值的概率',
        '卖 Put 的 Δ 为负：股涨你赚',
      ],
      insight: '卖方最佳 |Δ| 区间：0.15–0.30，平衡收益与安全。',
    },
  },
  {
    icon: Zap,
    color: 'text-purple-400',
    accent: 'border-purple-500/30 bg-purple-500/5',
    en: {
      name: 'Gamma',
      symbol: 'Γ',
      analogy: 'Acceleration — how fast Delta changes',
      tips: [
        'High Γ = Delta moves fast, danger for sellers',
        'Peaks near expiry + at-the-money',
        'Choose longer DTE to keep Gamma manageable',
      ],
      insight: 'Gamma is the hidden killer — the closer to expiry, the more explosive.',
    },
    zh: {
      name: 'Gamma',
      symbol: 'Γ',
      analogy: '加速度 — Delta 变化的速度',
      tips: [
        'Γ 越高 → Delta 变化越快，卖方越危险',
        '临近到期 + 平值时 Gamma 最大',
        '选择较长 DTE 来控制 Gamma 风险',
      ],
      insight: 'Gamma 是隐藏杀手 — 越临近到期，变化越剧烈。',
    },
  },
  {
    icon: Clock,
    color: 'text-emerald-400',
    accent: 'border-emerald-500/30 bg-emerald-500/5',
    en: {
      name: 'Theta',
      symbol: 'Θ',
      analogy: 'Daily rent — time decay working FOR sellers',
      tips: [
        'Theta = your daily income as a seller',
        'Accelerates in last 30 days before expiry',
        'DTE 30–45 is the sweet spot for selling',
      ],
      insight: 'Theta is the core edge — time decays every day, weekends included.',
    },
    zh: {
      name: 'Theta',
      symbol: 'Θ',
      analogy: '每日房租 — 时间衰减是卖方的收入来源',
      tips: ['Theta = 你每天赚的钱', '最后 30 天衰减加速（指数级）', 'DTE 30–45 天是最佳卖出窗口'],
      insight: 'Theta 是核心优势 — 时间每天都在衰减，包括周末。',
    },
  },
  {
    icon: BarChart3,
    color: 'text-orange-400',
    accent: 'border-orange-500/30 bg-orange-500/5',
    en: {
      name: 'Vega',
      symbol: 'ν',
      analogy: 'Fear gauge — sensitivity to implied volatility',
      tips: [
        'Sellers are short Vega: IV drops = you profit',
        'Sell when IV Rank > 50% for edge',
        'IV mean-reverts → high IV selling = double win',
      ],
      insight: 'Always sell premium in high IV — volatility crush is your friend.',
    },
    zh: {
      name: 'Vega',
      symbol: 'ν',
      analogy: '恐慌系数 — 对隐含波动率的敏感度',
      tips: [
        '卖方做空 Vega：IV 下降 = 你赚钱',
        'IV Rank > 50% 时卖出更有优势',
        'IV 会均值回归 → 高 IV 卖出 = 双重获利',
      ],
      insight: '永远在高 IV 时卖出 — 波动率回落是你的朋友。',
    },
  },
];

export function GreeksGuide() {
  const locale = useLocale() as 'en' | 'zh';

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {GREEKS.map((g) => {
        const content = g[locale];
        const Icon = g.icon;
        return (
          <Card key={content.name} className={`border ${g.accent}`}>
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted`}
                >
                  <Icon className={`h-5 w-5 ${g.color}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-2xl font-bold ${g.color}`}>
                      {content.symbol}
                    </span>
                    <span className="text-sm font-semibold">{content.name}</span>
                    {content.name === 'Theta' && (
                      <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">
                        {locale === 'zh' ? '卖方最爱' : "Seller's Edge"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{content.analogy}</p>
                </div>
              </div>

              <ul className="space-y-1.5">
                {content.tips.map((tip, i) => (
                  <li key={i} className="flex gap-2 text-xs text-foreground/80">
                    <span className={`mt-0.5 ${g.color}`}>•</span>
                    {tip}
                  </li>
                ))}
              </ul>

              <div className="rounded-lg border border-border bg-muted/50 px-3 py-2">
                <p className="text-xs font-medium text-foreground/90">{content.insight}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
