import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface PortfolioChartProps {
  history: { timestamp: string; value: number }[];
}

// Dark-mode monochrome hex values matching design tokens
const FG      = '#FAFAFA';  // --n-01
const MUTED   = '#525252';  // --n-07
const SUBTLE  = '#3A3A3A';  // --n-08
const BORDER  = '#262626';  // --n-09
const LOSS    = '#C0383A';  // approximate --state-loss in hex
const BG_EL   = '#111111';  // --n-11

export function PortfolioChart({ history }: PortfolioChartProps) {
  if (history.length < 2) {
    return (
      <div style={{
        height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-subtle)',
      }}>
        ∅ No history yet — run your agent to generate data.
      </div>
    );
  }

  const chartData = history.map(p => ({
    ts: new Date(p.timestamp).getTime(),
    value: p.value,
  }));

  const startValue = 100000;
  const currentValue = chartData[chartData.length - 1]?.value ?? startValue;
  const pnl = currentValue - startValue;
  const pnlPct = ((pnl / startValue) * 100).toFixed(2);
  const isGain = pnl >= 0;
  const lineColor = isGain ? FG : LOSS;

  const minV = Math.min(...chartData.map(d => d.value)) * 0.97;
  const maxV = Math.max(...chartData.map(d => d.value)) * 1.03;

  return (
    <div>
      {/* Summary row */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 16, alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontVariantNumeric: 'tabular-nums' }}>
          § {currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: isGain ? 'var(--fg)' : 'var(--state-loss)' }}>
          {isGain ? '+' : ''}{pnlPct}%
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)' }}>
          from § {startValue.toLocaleString()}
        </span>
      </div>

      {/* Chart */}
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id="sr-portfolio-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.12} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke={BORDER} vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={ts => new Date(ts as number).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              stroke={SUBTLE}
              tick={{ fill: MUTED, fontFamily: 'monospace', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[minV, maxV]}
              tickFormatter={v => `${((v as number) / 1000).toFixed(0)}K`}
              stroke={SUBTLE}
              tick={{ fill: MUTED, fontFamily: 'monospace', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: BG_EL,
                border: `1px solid ${BORDER}`,
                borderRadius: 0,
                fontFamily: 'monospace',
                fontSize: 12,
                color: FG,
              }}
              labelFormatter={ts => new Date(ts as number).toLocaleString()}
              formatter={(v: number | undefined) => [`§ ${(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Portfolio']}
              cursor={{ stroke: MUTED, strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            <ReferenceLine y={startValue} stroke={SUBTLE} strokeDasharray="3 3" />
            <Area
              type="monotone"
              dataKey="value"
              stroke={lineColor}
              strokeWidth={1.25}
              fill="url(#sr-portfolio-fill)"
              dot={false}
              activeDot={{ r: 3, fill: lineColor, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
