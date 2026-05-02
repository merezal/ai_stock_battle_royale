import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getCompanies, foundCompany } from '../api/client';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { UserLink } from '../components/UserLink';

export function Companies() {
  const { userId } = useCurrentUser();
  const queryClient = useQueryClient();
  const [showFoundForm, setShowFoundForm] = useState(false);
  const [ticker, setTicker] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [investment, setInvestment] = useState('');
  const [shares, setShares] = useState('');
  const [error, setError] = useState('');

  const { data: companies, isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: getCompanies,
  });

  const foundMutation = useMutation({
    mutationFn: () =>
      foundCompany(ticker.toUpperCase(), companyName, parseFloat(investment), parseInt(shares)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      setShowFoundForm(false);
      setTicker('');
      setCompanyName('');
      setInvestment('');
      setShares('');
      setError('');
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleFound = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      setError('Please log in to found a company');
      return;
    }
    foundMutation.mutate();
  };

  const pricePerShare = investment && shares ? parseFloat(investment) / parseInt(shares) : 0;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white">Companies</h1>
        {userId && (
          <button
            onClick={() => setShowFoundForm(!showFoundForm)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-medium"
          >
            {showFoundForm ? 'Cancel' : 'Found Company'}
          </button>
        )}
      </div>

      {/* Found Company Form */}
      {showFoundForm && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4">Found a New Company</h2>
          <form onSubmit={handleFound} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Ticker Symbol</label>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                maxLength={10}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white uppercase focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="e.g., ACME"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="e.g., Acme Corporation"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Investment Amount ($)</label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={investment}
                onChange={(e) => setInvestment(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Amount to invest"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Total Shares to Issue</label>
              <input
                type="number"
                min="1"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Number of shares"
              />
            </div>

            {pricePerShare > 0 && (
              <div className="bg-gray-700/50 rounded p-3">
                <p className="text-gray-400 text-sm">Initial Price per Share</p>
                <p className="text-xl font-bold text-green-400">
                  ${pricePerShare.toLocaleString()}
                </p>
              </div>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={foundMutation.isPending}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-md font-medium disabled:opacity-50"
            >
              {foundMutation.isPending ? 'Founding...' : 'Found Company'}
            </button>
          </form>
        </div>
      )}

      {/* Companies List */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-gray-400">Loading...</div>
        ) : companies && companies.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm bg-gray-700/50">
                <th className="px-6 py-3">Ticker</th>
                <th className="px-6 py-3">Company Name</th>
                <th className="px-6 py-3 text-right">VWAP</th>
                <th className="px-6 py-3 text-right">Shares Issued</th>
                <th className="px-6 py-3 text-right">Market Cap</th>
                <th className="px-6 py-3">Founded By</th>
              </tr>
            </thead>
            <tbody>
              {[...companies]
                .sort((a, b) => {
                  const marketCapA = a.currentPrice * parseInt(a.totalSharesIssued);
                  const marketCapB = b.currentPrice * parseInt(b.totalSharesIssued);
                  return marketCapB - marketCapA;
                })
                .map((c) => {
                const marketCap = c.currentPrice * parseInt(c.totalSharesIssued);
                return (
                  <tr
                    key={c.ticker}
                    className="border-t border-gray-700 hover:bg-gray-700/30"
                  >
                    <td className="px-6 py-4">
                      <Link
                        to={`/companies/${c.ticker}`}
                        className="text-green-400 hover:text-green-300 font-bold"
                      >
                        {c.ticker}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-white">{c.companyName}</td>
                    <td className="px-6 py-4 text-right text-white font-medium">
                      ${c.currentPrice.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-300">
                      {parseInt(c.totalSharesIssued).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-300">
                      ${marketCap.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      {c.foundedBy ? <UserLink username={c.foundedBy} /> : <span className="text-gray-400">Unknown</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-6 text-center text-gray-400">
            No companies yet. Be the first to found one!
          </div>
        )}
      </div>
    </div>
  );
}
