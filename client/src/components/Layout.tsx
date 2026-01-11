import { Link, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { getBotStatus, type BotStatus } from '../api/client';

export function Layout() {
  const location = useLocation();
  const { userId, user, setUserId } = useCurrentUser();

  const { data: botStatus } = useQuery<BotStatus>({
    queryKey: ['botStatus'],
    queryFn: getBotStatus,
    refetchInterval: 2000,
  });

  const navItems = [
    { path: '/', label: 'Dashboard' },
    { path: '/leaderboard', label: 'Leaderboard' },
    { path: '/companies', label: 'Companies' },
    { path: '/posts', label: 'Posts' },
    { path: '/bot', label: 'AI Bot' },
  ];

  return (
    <div className="min-h-screen bg-gray-900">
      <nav className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <Link to="/" className="text-xl font-bold text-green-400">
                Stock Battle Royale
              </Link>
              <div className="flex space-x-4">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      location.pathname === item.path
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {/* Bot execution indicator */}
              {botStatus?.currentBot && (
                <Link
                  to="/bot"
                  className="flex items-center space-x-2 bg-green-900/50 border border-green-700 rounded-full px-3 py-1"
                >
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-green-400 text-sm">
                    Running: <span className="font-medium">{botStatus.currentBot.username}</span>
                  </span>
                  {botStatus.queue.length > 0 && (
                    <span className="text-green-600 text-xs">+{botStatus.queue.length}</span>
                  )}
                </Link>
              )}

              {userId ? (
                <div className="flex items-center space-x-4">
                  <span className="text-gray-300">
                    Logged in as{' '}
                    <span className="text-green-400 font-medium">
                      {user?.username || 'Loading...'}
                    </span>
                  </span>
                  <button
                    onClick={() => setUserId(null)}
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-md text-sm font-medium"
                  >
                    Log Out
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                  Login / Register
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
