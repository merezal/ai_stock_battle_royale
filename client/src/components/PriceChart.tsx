import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { Transaction } from '../types';

interface PriceChartProps {
  transactions: Transaction[];
  currentPrice: number;
  foundingPrice?: number | null;
  foundedAt?: string;
}

const FG     = '#FAFAFA';
const MUTED  = '#525252';
const SUBTLE = '#3A3A3A';
const BORDER = '#262626';
const BG_EL  = '#111111';

export function PriceChart({ transactions, currentPrice, foundingPrice, foundedAt }: PriceChartProps) {
  const chartData: { timestamp: number; price: number }[] = [];

  if (foundingPrice != null && foundedAt) {
    chartData.push({
      timestamp: new Date(foundedAt).getTime(),
      price: foundingPrice,
    });
  }

  const sortedTransactions = [...transactions].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (const tx of sortedTransactions) {
    chartData.push({
      timestamp: new Date(tx.timestamp).getTime(),
      price: tx.pricePerShare,
    });
  }

  if (chartData.length === 0) {
    return (
      <div style={{
        height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-subtle)',
      }}>
        ∅ No trading history yet.
      </div>
    );
  }

  const dataMin = Math.min(...chartData.map(d => d.price));
  const dataMax = Math.max(...chartData.map(d => d.price));
  const dataPad = Math.max((dataMax - dataMin) * 0.15, dataMax * 0.005);
  const minPrice = dataMin - dataPad;
  const maxPrice = dataMax + dataPad;

  const lastTradePrice = sortedTransactions.length > 0
    ? sortedTransactions[sortedTransactions.length - 1].pricePerShare
    : null;

  const firstPrice = chartData[0]?.price;
  const lastPrice = chartData[chartData.length - 1]?.price;
  const isGain = lastPrice != null && firstPrice != null ? lastPrice >= firstPrice : true;
  const lineColor = isGain ? FG : '#C0383A';

  return (
    <div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id="sr-price-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.12} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke={BORDER} vertical={false} />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={ts => new Date(ts as number).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              stroke={SUBTLE}
              tick={{ fill: MUTED, fontFamily: 'monospace', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[minPrice, maxPrice]}
              tickFormatter={v => `§ ${(v as number).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
              stroke={SUBTLE}
              tick={{ fill: MUTED, fontFamily: 'monospace', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={56}
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
              formatter={(v: number | undefined) => [`§ ${(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Price']}
              cursor={{ stroke: MUTED, strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={lineColor}
              strokeWidth={1.25}
              fill="url(#sr-price-fill)"
              dot={false}
              activeDot={{ r: 3, fill: lineColor, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div style={{
        marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}`,
        display: 'flex', flexWrap: 'wrap', gap: '8px 24px',
        fontFamily: 'monospace', fontSize: 11,
      }}>
        <div>
          <span style={{ color: MUTED }}>VWAP </span>
          <span style={{ color: FG }}>§ {currentPrice.toLocaleString()}</span>
          <span style={{ color: MUTED, marginLeft: 6 }}>(used for valuations)</span>
        </div>
        {lastTradePrice != null && (
          <div>
            <span style={{ color: MUTED }}>Last trade </span>
            <span style={{ color: FG }}>§ {lastTradePrice.toLocaleString()}</span>
          </div>
        )}
        {foundingPrice != null && (
          <div>
            <span style={{ color: MUTED }}>Founded at </span>
            <span style={{ color: FG }}>§ {foundingPrice.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}
