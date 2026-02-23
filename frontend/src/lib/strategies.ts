export type StrategyKey = 'csp' | 'cc' | 'bullPut' | 'bearCall' | 'ironCondor' | 'strangle';

export interface ParamDef {
  key: string;
  default: number;
  min: number;
  max: number;
  step: number;
}

export interface StrategyMetrics {
  maxProfit: number;
  maxLoss: number | null;
  breakevens: number[];
}

interface StrategyDef {
  params: ParamDef[];
  payoff(price: number, p: Record<string, number>): number;
  metrics(p: Record<string, number>): StrategyMetrics;
  range(p: Record<string, number>): [number, number];
}

export const STRATEGY_KEYS: StrategyKey[] = [
  'csp',
  'cc',
  'bullPut',
  'bearCall',
  'ironCondor',
  'strangle',
];

export const STRATEGIES: Record<StrategyKey, StrategyDef> = {
  csp: {
    params: [
      { key: 'strike', default: 60, min: 40, max: 80, step: 1 },
      { key: 'premium', default: 2, min: 0.5, max: 8, step: 0.25 },
    ],
    payoff: (s, p) => (s >= p.strike ? p.premium : p.premium - (p.strike - s)),
    metrics: (p) => ({
      maxProfit: p.premium,
      maxLoss: -(p.strike - p.premium),
      breakevens: [p.strike - p.premium],
    }),
    range: (p) => [Math.max(0, p.strike - 20), p.strike + 15],
  },
  cc: {
    params: [
      { key: 'entryPrice', default: 65, min: 45, max: 85, step: 1 },
      { key: 'strike', default: 70, min: 50, max: 90, step: 1 },
      { key: 'premium', default: 1.5, min: 0.5, max: 6, step: 0.25 },
    ],
    payoff: (s, p) => Math.min(s, p.strike) - p.entryPrice + p.premium,
    metrics: (p) => ({
      maxProfit: p.strike - p.entryPrice + p.premium,
      maxLoss: -(p.entryPrice - p.premium),
      breakevens: [p.entryPrice - p.premium],
    }),
    range: (p) => [Math.max(0, p.entryPrice - 20), p.strike + 15],
  },
  bullPut: {
    params: [
      { key: 'sellStrike', default: 60, min: 45, max: 75, step: 1 },
      { key: 'buyStrike', default: 55, min: 40, max: 70, step: 1 },
      { key: 'netCredit', default: 2, min: 0.5, max: 4.5, step: 0.25 },
    ],
    payoff: (s, p) => {
      if (s >= p.sellStrike) return p.netCredit;
      if (s <= p.buyStrike) return p.netCredit - (p.sellStrike - p.buyStrike);
      return p.netCredit - (p.sellStrike - s);
    },
    metrics: (p) => ({
      maxProfit: p.netCredit,
      maxLoss: -(p.sellStrike - p.buyStrike - p.netCredit),
      breakevens: [p.sellStrike - p.netCredit],
    }),
    range: (p) => [p.buyStrike - 10, p.sellStrike + 15],
  },
  bearCall: {
    params: [
      { key: 'sellStrike', default: 72, min: 55, max: 85, step: 1 },
      { key: 'buyStrike', default: 77, min: 60, max: 90, step: 1 },
      { key: 'netCredit', default: 1.5, min: 0.5, max: 4.5, step: 0.25 },
    ],
    payoff: (s, p) => {
      if (s <= p.sellStrike) return p.netCredit;
      if (s >= p.buyStrike) return p.netCredit - (p.buyStrike - p.sellStrike);
      return p.netCredit - (s - p.sellStrike);
    },
    metrics: (p) => ({
      maxProfit: p.netCredit,
      maxLoss: -(p.buyStrike - p.sellStrike - p.netCredit),
      breakevens: [p.sellStrike + p.netCredit],
    }),
    range: (p) => [p.sellStrike - 15, p.buyStrike + 10],
  },
  ironCondor: {
    params: [
      { key: 'putBuyStrike', default: 50, min: 35, max: 55, step: 1 },
      { key: 'putSellStrike', default: 55, min: 40, max: 65, step: 1 },
      { key: 'callSellStrike', default: 72, min: 65, max: 85, step: 1 },
      { key: 'callBuyStrike', default: 77, min: 70, max: 90, step: 1 },
      { key: 'netCredit', default: 3, min: 1, max: 6, step: 0.25 },
    ],
    payoff: (s, p) => {
      let pnl = p.netCredit;
      if (s < p.putSellStrike)
        pnl -= Math.min(p.putSellStrike - s, p.putSellStrike - p.putBuyStrike);
      if (s > p.callSellStrike)
        pnl -= Math.min(s - p.callSellStrike, p.callBuyStrike - p.callSellStrike);
      return pnl;
    },
    metrics: (p) => ({
      maxProfit: p.netCredit,
      maxLoss:
        -Math.max(p.putSellStrike - p.putBuyStrike, p.callBuyStrike - p.callSellStrike) +
        p.netCredit,
      breakevens: [p.putSellStrike - p.netCredit, p.callSellStrike + p.netCredit],
    }),
    range: (p) => [p.putBuyStrike - 10, p.callBuyStrike + 10],
  },
  strangle: {
    params: [
      { key: 'putStrike', default: 55, min: 40, max: 65, step: 1 },
      { key: 'callStrike', default: 75, min: 65, max: 90, step: 1 },
      { key: 'totalPremium', default: 3.5, min: 1, max: 8, step: 0.25 },
    ],
    payoff: (s, p) => {
      if (s < p.putStrike) return p.totalPremium - (p.putStrike - s);
      if (s > p.callStrike) return p.totalPremium - (s - p.callStrike);
      return p.totalPremium;
    },
    metrics: (p) => ({
      maxProfit: p.totalPremium,
      maxLoss: null,
      breakevens: [p.putStrike - p.totalPremium, p.callStrike + p.totalPremium],
    }),
    range: (p) => [p.putStrike - 15, p.callStrike + 15],
  },
};

// ---- Locale content ----

type Locale = 'en' | 'zh';

interface StrategyInfo {
  name: string;
  desc: string;
  outlook: string;
}

export const STRATEGY_INFO: Record<StrategyKey, Record<Locale, StrategyInfo>> = {
  csp: {
    en: {
      name: 'Cash Secured Put',
      desc: 'Sell a put backed by cash. Profit when stock stays above strike.',
      outlook: 'Bullish / Neutral',
    },
    zh: {
      name: '现金担保卖 Put',
      desc: '卖出看跌期权，现金做担保。股价不跌破行权价，权利金全归你。',
      outlook: '看涨 / 中性',
    },
  },
  cc: {
    en: {
      name: 'Covered Call',
      desc: 'Own shares + sell a call. Cap upside for premium income.',
      outlook: 'Neutral / Mildly Bullish',
    },
    zh: {
      name: '备兑看涨',
      desc: '持有正股 + 卖出看涨期权。牺牲上涨空间，换取权利金收入。',
      outlook: '中性 / 温和看涨',
    },
  },
  bullPut: {
    en: {
      name: 'Bull Put Spread',
      desc: 'Sell high-strike put, buy low-strike put. Defined risk & reward.',
      outlook: 'Bullish',
    },
    zh: {
      name: '牛市 Put 价差',
      desc: '卖出高行权价 Put + 买入低行权价 Put。风险和收益都有上限。',
      outlook: '看涨',
    },
  },
  bearCall: {
    en: {
      name: 'Bear Call Spread',
      desc: 'Sell low-strike call, buy high-strike call. Profit when stock stays flat or drops.',
      outlook: 'Bearish / Neutral',
    },
    zh: {
      name: '熊市 Call 价差',
      desc: '卖出低行权价 Call + 买入高行权价 Call。股价不涨即可获利。',
      outlook: '看跌 / 中性',
    },
  },
  ironCondor: {
    en: {
      name: 'Iron Condor',
      desc: 'Bull put + bear call spread. Profit when stock stays in a range.',
      outlook: 'Neutral (Range-bound)',
    },
    zh: {
      name: '铁鹰价差',
      desc: '组合牛市 Put + 熊市 Call 价差。股价在区间震荡即可两头收租。',
      outlook: '中性（区间震荡）',
    },
  },
  strangle: {
    en: {
      name: 'Short Strangle',
      desc: 'Sell OTM put + OTM call. Max theta but unlimited risk.',
      outlook: 'Neutral (High conviction)',
    },
    zh: {
      name: '卖出宽跨式',
      desc: '同时卖出虚值 Put 和 Call。双倍权利金，但两侧风险无限。',
      outlook: '中性（高确信度）',
    },
  },
};

export const PARAM_LABELS: Record<string, Record<Locale, string>> = {
  strike: { en: 'Strike', zh: '行权价' },
  premium: { en: 'Premium', zh: '权利金' },
  entryPrice: { en: 'Entry', zh: '买入价' },
  sellStrike: { en: 'Sell Strike', zh: '卖出行权价' },
  buyStrike: { en: 'Buy Strike', zh: '买入行权价' },
  netCredit: { en: 'Net Credit', zh: '净权利金' },
  putStrike: { en: 'Put Strike', zh: 'Put 行权价' },
  callStrike: { en: 'Call Strike', zh: 'Call 行权价' },
  totalPremium: { en: 'Premium', zh: '总权利金' },
  putBuyStrike: { en: 'Put Buy', zh: 'Put 买入价' },
  putSellStrike: { en: 'Put Sell', zh: 'Put 卖出价' },
  callSellStrike: { en: 'Call Sell', zh: 'Call 卖出价' },
  callBuyStrike: { en: 'Call Buy', zh: 'Call 买入价' },
};

export interface PayoffPoint {
  price: number;
  pnl: number;
}

export function generatePayoff(key: StrategyKey, params: Record<string, number>): PayoffPoint[] {
  const s = STRATEGIES[key];
  const [lo, hi] = s.range(params);
  const step = (hi - lo) / 120;
  const data: PayoffPoint[] = [];
  for (let p = lo; p <= hi; p += step) {
    data.push({ price: +p.toFixed(2), pnl: +s.payoff(p, params).toFixed(2) });
  }
  return data;
}
