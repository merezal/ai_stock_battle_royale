import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCompany, getOrderBook, getTransactions, splitStock, getPortfolioByUsername } from '../api/client';
import { UserLink } from '../components/UserLink';
import { PriceChart } from '../components/PriceChart';
import { useCurrentUser } from '../hooks/useCurrentUser';

export function CompanyDetail() {
  const { ticker } = useParams<{ ticker: string }>();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [splitError, setSplitError] = useState('');

  const { data: company, isLoading } = useQuery({
    queryKey: ['company', ticker],
    queryFn: () => getCompany(ticker!),
    enabled: !!ticker,
    refetchInterval: 10000,
  });

  const { data: userPortfolio } = useQuery({
    queryKey: ['portfolio', 'username', user?.username],
    queryFn: () => getPortfolioByUsername(user!.username),
    enabled: !!user?.username,
  });

  const splitMutation = useMutation({
    mutationFn: () => splitStock(ticker!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', ticker] });
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['orderbook'] });
      setSplitError('');
    },
    onError: (err: Error) => setSplitError(err.message),
  });

  const { data: orderBook } = useQuery({
    queryKey: ['orderbook', ticker],
    queryFn: () => getOrderBook(ticker),
    enabled: !!ticker,
    refetchInterval: 5000,
  });

  const { data: transactions } = useQuery({
    queryKey: ['transactions', ticker],
    queryFn: () => getTransactions(ticker, undefined, 20),
    enabled: !!ticker,
    refetchInterval: 10000,
  });

  if (isLoading) {
    return <div className="text-gray-400">Loading...</div>;
  }

  if (!company) {
    return <div className="text-red-400">Company not found</div>;
  }

  const marketCap = company.currentPrice * parseInt(company.totalSharesIssued);

  // Check if current user is majority shareholder
  const userHolding = userPortfolio?.holdings.find(h => h.ticker === ticker?.toUpperCase());
  const userShares = userHolding?.sharesOwned ?? 0;
  const totalShares = parseInt(company.totalSharesIssued);
  const ownershipPercent = totalShares > 0 ? (userShares / totalShares) * 100 : 0;
  const isMajorityShareholder = ownershipPercent > 50;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">
              <span className="text-green-400">{company.ticker}</span> - {company.companyName}
            </h1>
            <p className="text-gray-400 mt-1">
              Founded by {company.foundedBy ? <UserLink username={company.foundedBy} /> : 'Unknown'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-green-400">
              ${company.currentPrice.toLocaleString()}
            </p>
            <p className="text-gray-400 text-sm">per share</p>
            {isMajorityShareholder && (
              <button
                onClick={() => splitMutation.mutate()}
                disabled={splitMutation.isPending}
                className="mt-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
              >
                {splitMutation.isPending ? 'Splitting...' : '2:1 Stock Split'}
              </button>
            )}
            {splitError && <p className="text-red-400 text-xs mt-1">{splitError}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div>
            <p className="text-gray-400 text-sm">Market Cap</p>
            <p className="text-xl font-semibold text-white">${marketCap.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Total Shares</p>
            <p className="text-xl font-semibold text-white">
              {parseInt(company.totalSharesIssued).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Last Trade</p>
            <p className="text-xl font-semibold text-white">
              {company.lastTradeTime
                ? new Date(company.lastTradeTime).toLocaleString()
                : 'No trades yet'}
            </p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Shareholders</p>
            <p className="text-xl font-semibold text-white">
              {company.shareholders?.length || 0}
            </p>
          </div>
        </div>
      </div>

      {/* Price Chart */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4">Price History</h2>
        <PriceChart
          transactions={transactions || []}
          currentPrice={company.currentPrice}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Order Book */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4">Order Book</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-green-400 font-medium mb-2">Bids (Buy)</h3>
              {orderBook?.bids.length ? (
                <div className="space-y-1">
                  {orderBook.bids.map((bid) => (
                    <div
                      key={bid.bidId}
                      className="flex justify-between text-sm bg-green-900/20 px-2 py-1 rounded"
                    >
                      <span className="text-gray-300">{bid.shares} shares</span>
                      <span className="text-green-400">${bid.pricePerShare.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No bids</p>
              )}
            </div>
            <div>
              <h3 className="text-red-400 font-medium mb-2">Asks (Sell)</h3>
              {orderBook?.asks.length ? (
                <div className="space-y-1">
                  {orderBook.asks.map((ask) => (
                    <div
                      key={ask.askId}
                      className="flex justify-between text-sm bg-red-900/20 px-2 py-1 rounded"
                    >
                      <span className="text-gray-300">{ask.shares} shares</span>
                      <span className="text-red-400">${ask.pricePerShare.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No asks</p>
              )}
            </div>
          </div>
        </div>

        {/* Shareholders */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4">Shareholders</h2>
          {company.shareholders && company.shareholders.length > 0 ? (
            <div className="space-y-2">
              {company.shareholders.map((sh) => {
                const sharePercent =
                  (parseInt(sh.shares) / parseInt(company.totalSharesIssued)) * 100;
                return (
                  <div
                    key={sh.username}
                    className="flex justify-between items-center bg-gray-700/50 px-3 py-2 rounded"
                  >
                    <UserLink username={sh.username} className="font-medium" />
                    <div className="text-right">
                      <span className="text-gray-300">{parseInt(sh.shares).toLocaleString()} shares</span>
                      <span className="text-gray-500 text-sm ml-2">({sharePercent.toFixed(1)}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-500">No shareholders</p>
          )}
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4">Recent Transactions</h2>
        {transactions && transactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                  <th className="pb-2">Time</th>
                  <th className="pb-2">Buyer</th>
                  <th className="pb-2">Seller</th>
                  <th className="pb-2 text-right">Shares</th>
                  <th className="pb-2 text-right">Price</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx, i) => (
                  <tr key={tx.transactionId || i} className="border-b border-gray-700/50">
                    <td className="py-2 text-gray-400 text-sm">
                      {new Date(tx.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2">
                      <UserLink username={tx.buyer} className="text-green-400 hover:text-green-300" />
                    </td>
                    <td className="py-2">
                      <UserLink username={tx.seller} className="text-red-400 hover:text-red-300" />
                    </td>
                    <td className="py-2 text-right text-white">{tx.shares}</td>
                    <td className="py-2 text-right text-white">
                      ${tx.pricePerShare.toLocaleString()}
                    </td>
                    <td className="py-2 text-right text-white font-medium">
                      ${tx.totalAmount?.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500">No transactions yet</p>
        )}
      </div>
    </div>
  );
}
