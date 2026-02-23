'use client';

import { useLocale } from 'next-intl';
import {
  Timer,
  Shield,
  CalendarClock,
  RefreshCw,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface TipDef {
  icon: LucideIcon;
  color: string;
  en: { title: string; points: string[] };
  zh: { title: string; points: string[] };
}

const TIPS: TipDef[] = [
  {
    icon: Timer,
    color: 'text-cyan-400',
    en: {
      title: 'IV Timing',
      points: [
        'IV Rank > 50%: favorable selling environment',
        'IV Rank > 80%: premium selling goldmine',
        'IV mean-reverts — sell high, collect as it drops',
        'Avoid selling in historically low IV (IV Rank < 20%)',
      ],
    },
    zh: {
      title: 'IV 择时',
      points: [
        'IV Rank > 50%：适合卖出权利金',
        'IV Rank > 80%：绝佳卖出时机',
        'IV 会均值回归 — 高点卖出，下降时收割',
        '避免在历史低 IV 时卖出（IV Rank < 20%）',
      ],
    },
  },
  {
    icon: Shield,
    color: 'text-blue-400',
    en: {
      title: 'Position Sizing',
      points: [
        'Risk max 2–5% of account per trade',
        'Same underlying: max 15% total exposure',
        'Keep 50%+ buying power available',
        'Smaller size → survive longer → compound',
      ],
    },
    zh: {
      title: '仓位管理',
      points: [
        '单笔风险不超过账户的 2–5%',
        '同标的总风险敞口不超过 15%',
        '始终保持 50% 以上可用资金',
        '小仓位 → 存活更久 → 复利增长',
      ],
    },
  },
  {
    icon: CalendarClock,
    color: 'text-violet-400',
    en: {
      title: 'DTE Selection',
      points: [
        '30–45 DTE: best theta acceleration + time buffer',
        'Avoid last week: Gamma explosion risk',
        'Close at 50% max profit for efficiency',
        'Avoid holding through earnings unless intentional',
      ],
    },
    zh: {
      title: 'DTE 选择',
      points: [
        '30–45 天：Theta 加速 + 充足时间缓冲',
        '避免最后一周：Gamma 爆炸风险',
        '赚到 50% 最大盈利时考虑平仓',
        '非刻意持有不要跨财报',
      ],
    },
  },
  {
    icon: RefreshCw,
    color: 'text-amber-400',
    en: {
      title: 'Rolling Strategies',
      points: [
        'Delta > 0.30 → consider rolling',
        'Roll out (more time) & down (lower strike)',
        'Only roll if you can collect a net credit',
        'Rolling = admitting the trade needs help, act early',
      ],
    },
    zh: {
      title: '移仓策略',
      points: [
        'Delta > 0.30 → 考虑移仓',
        '向后（更长到期）+ 向下（更低行权价）',
        '只在能收到 net credit 时才移仓',
        '移仓 = 承认交易需要调整，越早越好',
      ],
    },
  },
  {
    icon: AlertTriangle,
    color: 'text-rose-400',
    en: {
      title: 'Assignment Handling',
      points: [
        'CSP assigned = bought stock at a discount',
        'Immediately sell covered call on assigned shares',
        'This is the "wheel" strategy — embrace it',
        'Never panic — assignment is part of the plan',
      ],
    },
    zh: {
      title: '指派应对',
      points: [
        'CSP 被行权 = 以折价买入了股票',
        '被行权后立即卖出备兑看涨（Covered Call）',
        '这就是"轮动策略（Wheel）" — 拥抱它',
        '不要恐慌 — 指派是计划的一部分',
      ],
    },
  },
];

export function SellerTips() {
  const locale = useLocale() as 'en' | 'zh';

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {TIPS.map((tip) => {
        const content = tip[locale];
        const Icon = tip.icon;
        return (
          <Card key={content.title} className="border-border">
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center gap-2.5">
                <Icon className={`h-4.5 w-4.5 ${tip.color}`} />
                <span className="text-sm font-semibold">{content.title}</span>
              </div>
              <ul className="space-y-1.5">
                {content.points.map((point, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-relaxed text-foreground/80">
                    <span className="text-muted-foreground">›</span>
                    {point}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
