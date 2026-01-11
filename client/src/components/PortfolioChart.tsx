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

export function PortfolioChart({ history }: PortfolioChartProps) {
  if (history.length < 2) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-500">
        No trading history yet
      </div>
    );
  }

  const chartData = history.map((point) => ({
    timestamp: new Date(point.timestamp).getTime(),
    value: point.value,
  }));

  const startValue = 100000;
  const currentValue = chartData[chartData.length - 1]?.value || startValue;
  const isUp = currentValue >= startValue;
  const changePercent = ((currentValue - startValue) / startValue * 100).toFixed(2);

  const minValue = Math.min(...chartData.map((d) => d.value)) * 0.95;
  const maxValue = Math.max(...chartData.map((d) => d.value)) * 1.05;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline space-x-2">
        <span className="text-2xl font-bold text-white">
          ${currentValue.toLocaleString()}
        </span>
        <span className={`text-sm font-medium ${isUp ? 'text-green-400' : 'text-red-400'}`}>
          {isUp ? '+' : ''}{changePercent}%
        </span>
        <span className="text-gray-500 text-sm">from $100,000</span>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={isUp ? '#10B981' : '#EF4444'}
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor={isUp ? '#10B981' : '#EF4444'}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(ts) => new Date(ts).toLocaleDateString()}
              stroke="#9CA3AF"
              fontSize={12}
            />
            <YAxis
              domain={[minValue, maxValue]}
              tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
              stroke="#9CA3AF"
              fontSize={12}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1F2937',
                border: '1px solid #374151',
                borderRadius: '8px',
              }}
              labelFormatter={(ts) => new Date(ts).toLocaleString()}
              formatter={(value) => [`$${(value as number).toLocaleString()}`, 'Portfolio Value']}
            />
            <ReferenceLine
              y={startValue}
              stroke="#6B7280"
              strokeDasharray="3 3"
              label={{
                value: 'Starting',
                position: 'right',
                fill: '#6B7280',
                fontSize: 10,
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={isUp ? '#10B981' : '#EF4444'}
              strokeWidth={2}
              fill="url(#colorValue)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
