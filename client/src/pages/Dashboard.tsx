import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPortfolio,
  getOrderBook,
  getCompanies,
  getTransactions,
  placeBid,
  placeAsk,
  fulfillBid,
  fulfillAsk,
  cancelBid,
  cancelAsk,
} from '../api/client';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { UserLink } from '../components/UserLink';
import { Link } from 'react-router-dom';

export function Dashboard() {
  const { userId, user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [selectedTicker, setSelectedTicker] = useState<string>('');
  const [orderType, setOrderType] = useState<'bid' | 'ask'>('bid');
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');

  const { data: portfolio } = useQuery({
    queryKey: ['portfolio', userId],
    queryFn: () => getPortfolio(userId!),
    enabled: userId !== null,
    refetchInterval: 10000,
  });

  const { data: companies } = useQuery({
    queryKey: ['companies'],
    queryFn: getCompanies,
  });

  const { data: orderBook, isLoading: orderBookLoading } = useQuery({
    queryKey: ['orderbook', selectedTicker || 'all'],
    queryFn: () => getOrderBook(selectedTicker || undefined),
    refetchInterval: 5000,
  });

  const { data: transactions } = useQuery({
    queryKey: ['transactions', user?.username],
    queryFn: () => getTransactions(undefined, user?.username, 10),
    enabled: user?.username !== undefined,
    refetchInterval: 10000,
  });

  const placeBidMutation = useMutation({
    mutationFn: () => placeBid(userId!, selectedTicker, parseInt(shares), parseFloat(price)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderbook'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
      setShares('');
      setPrice('');
      setError('');
    },
    onError: (err: Error) => setError(err.message),
  });

  const placeAskMutation = useMutation({
    mutationFn: () => placeAsk(userId!, selectedTicker, parseInt(shares), parseFloat(price)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderbook'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
      setShares('');
      setPrice('');
      setError('');
    },
    onError: (err: Error) => setError(err.message),
  });

  const fulfillBidMutation = useMutation({
    mutationFn: (bidId: number) => fulfillBid(bidId, userId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderbook'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const fulfillAskMutation = useMutation({
    mutationFn: (askId: number) => fulfillAsk(askId, userId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderbook'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const cancelBidMutation = useMutation({
    mutationFn: (bidId: number) => cancelBid(bidId, userId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderbook'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });

  const cancelAskMutation = useMutation({
    mutationFn: (askId: number) => cancelAsk(askId, userId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderbook'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      setError('Please log in to trade');
      return;
    }
    if (!selectedTicker) {
      setError('Please select a stock');
      return;
    }
    if (orderType === 'bid') {
      placeBidMutation.mutate();
    } else {
      placeAskMutation.mutate();
    }
  };

  // Not logged in - show welcome screen
  if (!userId) {
    return (
      <div className="space-y-8">
        <div className="text-center py-12">
          <h1 className="text-4xl font-bold text-white mb-4">Stock Battle Royale</h1>
          <p className="text-gray-400 text-lg mb-8">
            Compete to build the most valuable portfolio through trading and strategy.
          </p>
          <Link
            to="/login"
            className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-md text-lg font-medium"
          >
            Login / Register to Start
          </Link>
        </div>
      </div>
    );
  }

  // Logged in - show portfolio and trading
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-white">
        Welcome back, <span className="text-green-400">{portfolio?.username}</span>
      </h1>

      {/* User Portfolio */}
      {portfolio && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4">Your Portfolio</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <p className="text-gray-400 text-sm">Total Value</p>
              <p className="text-2xl font-bold text-green-400">
                ${portfolio.totalValue.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Cash Balance</p>
              <p className="text-xl font-semibold text-white">
                ${portfolio.cashBalance.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Available Cash</p>
              <p className="text-xl font-semibold text-white">
                ${portfolio.availableCash.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Stock Value</p>
              <p className="text-xl font-semibold text-white">
                ${portfolio.stockValue.toLocaleString()}
              </p>
            </div>
          </div>

          {portfolio.holdings.length > 0 ? (
            <div>
              <h3 className="text-lg font-medium text-white mb-3">Holdings</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                      <th className="pb-2">Ticker</th>
                      <th className="pb-2">Company</th>
                      <th className="pb-2 text-right">Shares</th>
                      <th className="pb-2 text-right">Price</th>
                      <th className="pb-2 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.holdings.map((h) => (
                      <tr key={h.ticker} className="border-b border-gray-700/50">
                        <td className="py-2">
                          <Link
                            to={`/companies/${h.ticker}`}
                            className="text-green-400 hover:text-green-300 font-medium"
                          >
                            {h.ticker}
                          </Link>
                        </td>
                        <td className="py-2 text-gray-300">{h.companyName}</td>
                        <td className="py-2 text-right text-white">
                          {h.sharesOwned}
                          {h.reservedShares > 0 && (
                            <span className="text-gray-500 text-sm ml-1">
                              ({h.reservedShares} reserved)
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right text-white">
                          ${h.currentPrice?.toLocaleString()}
                        </td>
                        <td className="py-2 text-right text-white font-medium">
                          ${h.positionValue?.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-400 mb-4">You don't own any stocks yet.</p>
              <Link
                to="/companies"
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Found a Company
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Trading Section */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Trade</h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Place Order Form */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-4">Place Order</h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Stock</label>
                <select
                  value={selectedTicker}
                  onChange={(e) => setSelectedTicker(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Select a stock...</option>
                  {companies?.map((c) => (
                    <option key={c.ticker} value={c.ticker}>
                      {c.ticker} - ${c.currentPrice.toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Order Type</label>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setOrderType('bid')}
                    className={`flex-1 py-2 rounded-md font-medium transition-colors ${
                      orderType === 'bid'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    Buy (Bid)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderType('ask')}
                    className={`flex-1 py-2 rounded-md font-medium transition-colors ${
                      orderType === 'ask'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    Sell (Ask)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Shares</label>
                <input
                  type="number"
                  min="1"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Number of shares"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Price per Share</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Price per share"
                />
              </div>

              {shares && price && (
                <div className="text-sm text-gray-400">
                  Total: ${(parseInt(shares) * parseFloat(price)).toLocaleString()}
                </div>
              )}

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={placeBidMutation.isPending || placeAskMutation.isPending}
                className={`w-full py-2 rounded-md font-medium transition-colors ${
                  orderType === 'bid'
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                } disabled:opacity-50`}
              >
                {placeBidMutation.isPending || placeAskMutation.isPending
                  ? 'Placing Order...'
                  : orderType === 'bid'
                  ? 'Place Buy Order'
                  : 'Place Sell Order'}
              </button>
            </form>
          </div>

          {/* Order Book */}
          <div className="lg:col-span-2 space-y-6">
            {/* Filter */}
            <div className="flex items-center space-x-4">
              <label className="text-gray-400">Filter by stock:</label>
              <select
                value={selectedTicker}
                onChange={(e) => setSelectedTicker(e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">All Stocks</option>
                {companies?.map((c) => (
                  <option key={c.ticker} value={c.ticker}>
                    {c.ticker}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Bids */}
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <h3 className="text-lg font-semibold text-green-400 mb-3">
                  Buy Orders (Bids)
                </h3>
                {orderBookLoading ? (
                  <p className="text-gray-400">Loading...</p>
                ) : orderBook?.bids.length ? (
                  <div className="space-y-2">
                    {orderBook.bids.map((bid) => (
                      <div
                        key={bid.bidId}
                        className="bg-gray-700/50 rounded p-3 flex justify-between items-center"
                      >
                        <div>
                          <div className="text-white font-medium">
                            {bid.ticker} - {bid.shares} shares
                          </div>
                          <div className="text-sm text-gray-400">
                            @ ${bid.pricePerShare.toLocaleString()} by{' '}
                            <UserLink username={bid.username} />
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          {bid.username !== user?.username && (
                            <button
                              onClick={() => fulfillBidMutation.mutate(bid.bidId)}
                              disabled={fulfillBidMutation.isPending}
                              className="bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-1 rounded"
                            >
                              Sell
                            </button>
                          )}
                          {bid.username === user?.username && (
                            <button
                              onClick={() => cancelBidMutation.mutate(bid.bidId)}
                              disabled={cancelBidMutation.isPending}
                              className="bg-gray-600 hover:bg-gray-500 text-white text-sm px-3 py-1 rounded"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No open buy orders</p>
                )}
              </div>

              {/* Asks */}
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <h3 className="text-lg font-semibold text-red-400 mb-3">
                  Sell Orders (Asks)
                </h3>
                {orderBookLoading ? (
                  <p className="text-gray-400">Loading...</p>
                ) : orderBook?.asks.length ? (
                  <div className="space-y-2">
                    {orderBook.asks.map((ask) => (
                      <div
                        key={ask.askId}
                        className="bg-gray-700/50 rounded p-3 flex justify-between items-center"
                      >
                        <div>
                          <div className="text-white font-medium">
                            {ask.ticker} - {ask.shares} shares
                          </div>
                          <div className="text-sm text-gray-400">
                            @ ${ask.pricePerShare.toLocaleString()} by{' '}
                            <UserLink username={ask.username} />
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          {ask.username !== user?.username && (
                            <button
                              onClick={() => fulfillAskMutation.mutate(ask.askId)}
                              disabled={fulfillAskMutation.isPending}
                              className="bg-red-600 hover:bg-red-700 text-white text-sm px-3 py-1 rounded"
                            >
                              Buy
                            </button>
                          )}
                          {ask.username === user?.username && (
                            <button
                              onClick={() => cancelAskMutation.mutate(ask.askId)}
                              disabled={cancelAskMutation.isPending}
                              className="bg-gray-600 hover:bg-gray-500 text-white text-sm px-3 py-1 rounded"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No open sell orders</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4">Your Recent Transactions</h2>
        {transactions && transactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Stock</th>
                  <th className="pb-2">Counterparty</th>
                  <th className="pb-2 text-right">Shares</th>
                  <th className="pb-2 text-right">Price</th>
                  <th className="pb-2 text-right">Total</th>
                  <th className="pb-2 text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const isBuyer = tx.buyer === user?.username;
                  return (
                    <tr key={tx.transactionId} className="border-b border-gray-700/50">
                      <td className="py-2">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            isBuyer
                              ? 'bg-green-900/50 text-green-400'
                              : 'bg-red-900/50 text-red-400'
                          }`}
                        >
                          {isBuyer ? 'BUY' : 'SELL'}
                        </span>
                      </td>
                      <td className="py-2">
                        <Link
                          to={`/companies/${tx.ticker}`}
                          className="text-green-400 hover:text-green-300 font-medium"
                        >
                          {tx.ticker}
                        </Link>
                      </td>
                      <td className="py-2">
                        <UserLink username={isBuyer ? tx.seller : tx.buyer} />
                      </td>
                      <td className="py-2 text-right text-white">{tx.shares}</td>
                      <td className="py-2 text-right text-white">
                        ${tx.pricePerShare.toLocaleString()}
                      </td>
                      <td className="py-2 text-right text-white font-medium">
                        ${(tx.totalAmount ?? Number(tx.shares) * tx.pricePerShare).toLocaleString()}
                      </td>
                      <td className="py-2 text-right text-gray-400 text-sm">
                        {new Date(tx.timestamp).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500">No transactions yet. Start trading to see your history here.</p>
        )}
      </div>
    </div>
  );
}
