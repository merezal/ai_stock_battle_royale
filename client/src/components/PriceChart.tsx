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
  foundingPrice?: number | null;
  foundedAt?: string;
}

export function PriceChart({ transactions, currentPrice, foundingPrice, foundedAt }: PriceChartProps) {
  const chartData: { timestamp: number; price: number; label: string }[] = [];

  // Add founding price as the first data point
  if (foundingPrice != null && foundedAt) {
    chartData.push({
      timestamp: new Date(foundedAt).getTime(),
      price: foundingPrice,
      label: 'Founded',
    });
  }

  // Add transaction prices
  const sortedTransactions = [...transactions].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (const tx of sortedTransactions) {
    chartData.push({
      timestamp: new Date(tx.timestamp).getTime(),
      price: tx.pricePerShare,
      label: new Date(tx.timestamp).toLocaleDateString(),
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

  const lastTradePrice = sortedTransactions.length > 0
    ? sortedTransactions[sortedTransactions.length - 1].pricePerShare
    : null;

  return (
    <div>
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
      <div className="mt-3 pt-3 border-t border-gray-700 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div>
          <span className="text-gray-400">VWAP: </span>
          <span className="text-green-400 font-medium">${currentPrice.toLocaleString()}</span>
          <span className="text-gray-500 ml-1">(used for valuations)</span>
        </div>
        {lastTradePrice != null && (
          <div>
            <span className="text-gray-400">Last Trade: </span>
            <span className="text-white">${lastTradePrice.toLocaleString()}</span>
          </div>
        )}
        {foundingPrice != null && (
          <div>
            <span className="text-gray-400">Founding Price: </span>
            <span className="text-white">${foundingPrice.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}
