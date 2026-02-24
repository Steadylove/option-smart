/**
 * SVG preview illustrations for the landing page marquee.
 * Each one simulates a mini screenshot of the corresponding app feature.
 */

const P = {
  bg: '#141820',
  card: '#1c2130',
  border: '#2a2f3d',
  muted: '#6b7280',
  text: '#e5e7eb',
  green: '#34d399',
  red: '#f87171',
  blue: '#60a5fa',
  purple: '#a78bfa',
  amber: '#fbbf24',
};

function Window({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <svg
      viewBox="0 0 400 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-full w-full"
    >
      <rect width="400" height="240" rx="12" fill={P.bg} />
      <rect
        x="0.5"
        y="0.5"
        width="399"
        height="239"
        rx="11.5"
        stroke={P.border}
        strokeOpacity="0.5"
      />
      {/* Title bar */}
      <circle cx="16" cy="14" r="4" fill="#ef4444" opacity="0.7" />
      <circle cx="28" cy="14" r="4" fill="#eab308" opacity="0.7" />
      <circle cx="40" cy="14" r="4" fill="#22c55e" opacity="0.7" />
      <text x="200" y="17" textAnchor="middle" fill={P.muted} fontSize="10" fontFamily="system-ui">
        {title}
      </text>
      <line x1="0" y1="28" x2="400" y2="28" stroke={P.border} strokeOpacity="0.4" />
      <g transform="translate(0, 28)">{children}</g>
    </svg>
  );
}

export function PreviewOptionChain() {
  const rows = [
    {
      strike: '62',
      call: '2.15',
      put: '0.45',
      callD: '-0.72',
      putD: '0.28',
      callBg: `${P.blue}15`,
    },
    {
      strike: '64',
      call: '1.20',
      put: '0.85',
      callD: '-0.55',
      putD: '0.45',
      callBg: `${P.blue}10`,
    },
    {
      strike: '66',
      call: '0.55',
      put: '1.60',
      callD: '-0.32',
      putD: '0.68',
      callBg: 'transparent',
    },
    {
      strike: '68',
      call: '0.18',
      put: '2.80',
      callD: '-0.15',
      putD: '0.85',
      callBg: 'transparent',
    },
  ];
  return (
    <Window title="Option Chain — TQQQ">
      {/* Header */}
      <rect x="12" y="8" width="376" height="20" rx="4" fill={P.card} />
      <text x="60" y="21" textAnchor="middle" fill={P.muted} fontSize="8" fontFamily="system-ui">
        CALLS
      </text>
      <text
        x="200"
        y="21"
        textAnchor="middle"
        fill={P.text}
        fontSize="8"
        fontFamily="system-ui"
        fontWeight="600"
      >
        Strike
      </text>
      <text x="340" y="21" textAnchor="middle" fill={P.muted} fontSize="8" fontFamily="system-ui">
        PUTS
      </text>
      {rows.map((r, i) => {
        const y = 36 + i * 38;
        return (
          <g key={i}>
            <rect x="12" y={y} width="170" height="30" rx="4" fill={r.callBg} />
            <text x="30" y={y + 18} fill={P.green} fontSize="10" fontFamily="monospace">
              ${r.call}
            </text>
            <text x="110" y={y + 18} fill={P.muted} fontSize="9" fontFamily="monospace">
              {r.callD}
            </text>
            <rect x="195" y={y + 4} width="26" height="22" rx="4" fill={P.card} />
            <text
              x="208"
              y={y + 19}
              textAnchor="middle"
              fill={P.text}
              fontSize="10"
              fontFamily="monospace"
              fontWeight="600"
            >
              {r.strike}
            </text>
            <text x="260" y={y + 18} fill={P.red} fontSize="10" fontFamily="monospace">
              ${r.put}
            </text>
            <text x="340" y={y + 18} fill={P.muted} fontSize="9" fontFamily="monospace">
              {r.putD}
            </text>
          </g>
        );
      })}
    </Window>
  );
}

export function PreviewGreeks() {
  const bars = [
    { label: 'Delta', value: -42, color: P.blue },
    { label: 'Gamma', value: 18, color: P.purple },
    { label: 'Theta', value: 65, color: P.green },
    { label: 'Vega', value: -28, color: P.amber },
  ];
  return (
    <Window title="Portfolio Greeks">
      {bars.map((b, i) => {
        const y = 20 + i * 44;
        const barW = Math.abs(b.value) * 1.8;
        const barX = b.value >= 0 ? 180 : 180 - barW;
        return (
          <g key={i}>
            <text x="24" y={y + 14} fill={P.text} fontSize="10" fontFamily="system-ui">
              {b.label}
            </text>
            <text
              x="80"
              y={y + 14}
              fill={b.value >= 0 ? P.green : P.red}
              fontSize="10"
              fontFamily="monospace"
              fontWeight="600"
            >
              {b.value > 0 ? '+' : ''}
              {b.value}
            </text>
            <rect x="130" y={y + 2} width="240" height="16" rx="3" fill={P.card} />
            <line x1="180" y1={y} x2="180" y2={y + 20} stroke={P.border} strokeDasharray="2 2" />
            <rect x={barX} y={y + 4} width={barW} height="12" rx="2" fill={b.color} opacity="0.6" />
          </g>
        );
      })}
    </Window>
  );
}

export function PreviewAiChat() {
  return (
    <Window title="AI Advisor — Robby">
      <rect x="12" y="10" width="250" height="36" rx="8" fill={P.card} />
      <text x="24" y="25" fill={P.muted} fontSize="8" fontFamily="system-ui">
        You
      </text>
      <text x="24" y="38" fill={P.text} fontSize="9" fontFamily="system-ui">
        TQQQ Put 到期前该平仓吗？
      </text>

      <rect x="50" y="56" width="338" height="100" rx="8" fill={`${P.blue}12`} />
      <text x="62" y="71" fill={P.blue} fontSize="8" fontFamily="system-ui" fontWeight="600">
        Robby
      </text>
      <text x="62" y="86" fill={P.text} fontSize="9" fontFamily="system-ui">
        当前持仓 TQQQ $62 Put 已盈利 72%，
      </text>
      <text x="62" y="100" fill={P.text} fontSize="9" fontFamily="system-ui">
        Theta 衰减加速，建议止盈平仓。
      </text>
      <text x="62" y="114" fill={P.green} fontSize="9" fontFamily="system-ui">
        ✓ 盈利概率 89% · DTE 3天
      </text>
      <rect x="62" y="124" width="60" height="18" rx="4" fill={P.green} opacity="0.2" />
      <text
        x="92"
        y="136"
        textAnchor="middle"
        fill={P.green}
        fontSize="8"
        fontFamily="system-ui"
        fontWeight="600"
      >
        平仓
      </text>
      <rect x="130" y="124" width="60" height="18" rx="4" fill={P.card} />
      <text x="160" y="136" textAnchor="middle" fill={P.muted} fontSize="8" fontFamily="system-ui">
        继续持有
      </text>

      <rect x="12" y="168" width="376" height="28" rx="6" fill={P.card} />
      <text x="24" y="186" fill={P.muted} fontSize="9" fontFamily="system-ui">
        追问 Robby...
      </text>
    </Window>
  );
}

export function PreviewStressTest() {
  const scenarios = [
    { label: 'Spot -10%', pnl: '-$2,340', color: P.red, w: 120 },
    { label: 'Spot -5%', pnl: '-$980', color: P.red, w: 60 },
    { label: 'IV +50%', pnl: '-$1,560', color: P.red, w: 85 },
    { label: 'T+7 days', pnl: '+$420', color: P.green, w: 45 },
    { label: 'Spot +5%', pnl: '+$680', color: P.green, w: 55 },
  ];
  return (
    <Window title="Stress Test">
      <text x="24" y="20" fill={P.muted} fontSize="9" fontFamily="system-ui">
        Scenario Impact on Portfolio
      </text>
      {scenarios.map((s, i) => {
        const y = 34 + i * 34;
        return (
          <g key={i}>
            <text x="24" y={y + 14} fill={P.text} fontSize="9" fontFamily="system-ui">
              {s.label}
            </text>
            <rect x="120" y={y + 2} width="200" height="16" rx="3" fill={P.card} />
            <rect x="120" y={y + 2} width={s.w} height="16" rx="3" fill={s.color} opacity="0.35" />
            <text
              x="340"
              y={y + 14}
              textAnchor="end"
              fill={s.color}
              fontSize="10"
              fontFamily="monospace"
              fontWeight="600"
            >
              {s.pnl}
            </text>
          </g>
        );
      })}
    </Window>
  );
}

export function PreviewPositions() {
  const positions = [
    { sym: 'TQQQ $62P', dte: '12d', pnl: '+$340', pct: '+68%', health: P.green },
    { sym: 'TSLL $18P', dte: '5d', pnl: '+$125', pct: '+42%', health: P.green },
    { sym: 'NVDL $40P', dte: '23d', pnl: '-$85', pct: '-12%', health: P.amber },
    { sym: 'TQQQ $70C', dte: '3d', pnl: '+$210', pct: '+88%', health: P.green },
  ];
  return (
    <Window title="Position Management">
      <rect x="12" y="8" width="376" height="18" rx="3" fill={P.card} />
      {['Contract', 'DTE', 'P&L', 'Health'].map((h, i) => (
        <text
          key={h}
          x={[30, 160, 240, 340][i]}
          y="20"
          fill={P.muted}
          fontSize="8"
          fontFamily="system-ui"
        >
          {h}
        </text>
      ))}
      {positions.map((p, i) => {
        const y = 36 + i * 38;
        return (
          <g key={i}>
            <text x="30" y={y + 14} fill={P.text} fontSize="10" fontFamily="monospace">
              {p.sym}
            </text>
            <text x="160" y={y + 14} fill={P.muted} fontSize="10" fontFamily="monospace">
              {p.dte}
            </text>
            <text
              x="230"
              y={y + 14}
              fill={p.pnl.startsWith('+') ? P.green : P.red}
              fontSize="10"
              fontFamily="monospace"
              fontWeight="600"
            >
              {p.pnl}
            </text>
            <text x="280" y={y + 14} fill={P.muted} fontSize="9" fontFamily="monospace">
              {p.pct}
            </text>
            <circle cx="345" cy={y + 10} r="5" fill={p.health} opacity="0.3" />
            <circle cx="345" cy={y + 10} r="3" fill={p.health} />
          </g>
        );
      })}
    </Window>
  );
}

export function PreviewAlerts() {
  const alerts = [
    {
      type: 'Take Profit',
      msg: 'TQQQ $62P profit 72% — consider closing',
      color: P.green,
      icon: '↑',
    },
    { type: 'DTE Warning', msg: 'TSLL $18P expires in 5 days', color: P.amber, icon: '⏱' },
    { type: 'Delta Breach', msg: 'NVDL $40P delta > 0.5 threshold', color: P.red, icon: '△' },
  ];
  return (
    <Window title="Smart Alerts">
      {alerts.map((a, i) => {
        const y = 12 + i * 62;
        return (
          <g key={i}>
            <rect x="12" y={y} width="376" height="50" rx="8" fill={P.card} />
            <rect x="12" y={y} width="4" height="50" rx="2" fill={a.color} />
            <circle cx="32" cy={y + 16} r="8" fill={a.color} opacity="0.15" />
            <text
              x="32"
              y={y + 19}
              textAnchor="middle"
              fill={a.color}
              fontSize="8"
              fontFamily="system-ui"
            >
              {a.icon}
            </text>
            <text
              x="48"
              y={y + 18}
              fill={a.color}
              fontSize="9"
              fontFamily="system-ui"
              fontWeight="600"
            >
              {a.type}
            </text>
            <text x="48" y={y + 36} fill={P.muted} fontSize="9" fontFamily="system-ui">
              {a.msg}
            </text>
          </g>
        );
      })}
    </Window>
  );
}
