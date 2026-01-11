import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPortfolioByUsername, getTransactions } from '../api/client';
import { useCurrentUser } from '../hooks/useCurrentUser';

export function UserProfile() {
  const { username } = useParams<{ username: string }>();
  const { user: currentUser } = useCurrentUser();

  const { data: portfolio, isLoading, error } = useQuery({
    queryKey: ['userProfile', username],
    queryFn: () => getPortfolioByUsername(username!),
    enabled: !!username,
  });

  const { data: transactions } = useQuery({
    queryKey: ['transactions', username],
    queryFn: () => getTransactions(undefined, username, 10),
    enabled: !!username,
  });

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-lg">Loading...</p>
      </div>
    );
  }

  if (error || !portfolio) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-white mb-4">User Not Found</h1>
        <p className="text-gray-400">The user "{username}" does not exist.</p>
        <Link
          to="/leaderboard"
          className="inline-block mt-4 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md"
        >
          View Leaderboard
        </Link>
      </div>
    );
  }

  const isOwnProfile = currentUser?.username === username;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">
          <span className="text-green-400">{portfolio.username}</span>'s Portfolio
          {isOwnProfile && <span className="text-gray-500 text-lg ml-2">(You)</span>}
        </h1>
        {isOwnProfile && (
          <Link
            to="/"
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Go to Dashboard
          </Link>
        )}
      </div>

      {/* Portfolio Summary */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4">Portfolio Summary</h2>
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

        {/* Holdings */}
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
          <p className="text-gray-500 text-center py-4">
            {portfolio.username} doesn't own any stocks yet.
          </p>
        )}
      </div>

      {/* Recent Transactions */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4">Recent Transactions</h2>
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
                  const isBuyer = tx.buyer === username;
                  const counterparty = isBuyer ? tx.seller : tx.buyer;
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
                        <Link
                          to={`/users/${counterparty}`}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          {counterparty}
                        </Link>
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
          <p className="text-gray-500">No transactions yet.</p>
        )}
      </div>
    </div>
  );
}
