import {
  LineChart,
  Line,
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
}

export function PriceChart({ transactions, currentPrice }: PriceChartProps) {
  // Sort transactions by timestamp and create chart data
  const chartData = [...transactions]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map((tx) => ({
      timestamp: new Date(tx.timestamp).getTime(),
      price: tx.pricePerShare,
      label: new Date(tx.timestamp).toLocaleDateString(),
    }));

  // Add current price as the last point if there are transactions
  if (chartData.length > 0) {
    chartData.push({
      timestamp: Date.now(),
      price: currentPrice,
      label: 'Now',
    });
  }

  if (chartData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-500">
        No trading history yet
      </div>
    );
  }

  const minPrice = Math.min(...chartData.map((d) => d.price)) * 0.95;
  const maxPrice = Math.max(...chartData.map((d) => d.price)) * 1.05;

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
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
            domain={[minPrice, maxPrice]}
            tickFormatter={(val) => `$${val.toLocaleString()}`}
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
            formatter={(value) => [`$${(value as number).toLocaleString()}`, 'Price']}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#10B981"
            strokeWidth={2}
            dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, fill: '#34D399' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
