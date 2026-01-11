import { useQuery } from '@tanstack/react-query';
import { getLeaderboard } from '../api/client';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { UserLink } from '../components/UserLink';

export function Leaderboard() {
  const { userId } = useCurrentUser();

  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: getLeaderboard,
    refetchInterval: 10000,
  });

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-white">Leaderboard</h1>

      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        {isLoading ? (
          <p className="text-gray-400">Loading...</p>
        ) : leaderboard && leaderboard.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                  <th className="pb-2">Rank</th>
                  <th className="pb-2">Player</th>
                  <th className="pb-2 text-right">Cash</th>
                  <th className="pb-2 text-right">Stocks</th>
                  <th className="pb-2 text-right">Total Value</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry, index) => (
                  <tr
                    key={entry.id}
                    className={`border-b border-gray-700/50 ${
                      entry.id === userId ? 'bg-green-900/20' : ''
                    }`}
                  >
                    <td className="py-3">
                      <span
                        className={`font-bold ${
                          index === 0
                            ? 'text-yellow-400'
                            : index === 1
                            ? 'text-gray-300'
                            : index === 2
                            ? 'text-amber-600'
                            : 'text-gray-500'
                        }`}
                      >
                        #{index + 1}
                      </span>
                    </td>
                    <td className="py-3 font-medium">
                      <UserLink username={entry.username} className="text-white hover:text-blue-300" />
                    </td>
                    <td className="py-3 text-right text-gray-300">
                      ${entry.cashBalance.toLocaleString()}
                    </td>
                    <td className="py-3 text-right text-gray-300">
                      ${entry.stockValue.toLocaleString()}
                    </td>
                    <td className="py-3 text-right text-green-400 font-bold">
                      ${entry.totalValue.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400">No players yet. Be the first to register!</p>
        )}
      </div>
    </div>
  );
}
