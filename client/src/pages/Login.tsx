import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { registerUser, getLeaderboard } from '../api/client';
import { useCurrentUser } from '../hooks/useCurrentUser';

export function Login() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setUserId } = useCurrentUser();
  const [mode, setMode] = useState<'select' | 'register'>('select');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const { data: users } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: getLeaderboard,
  });

  const registerMutation = useMutation({
    mutationFn: () => registerUser(username, email),
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      setUserId(user.id);
      navigate('/');
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSelectUser = (id: number) => {
    setUserId(id);
    navigate('/');
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !email.trim()) {
      setError('Username and email are required');
      return;
    }
    registerMutation.mutate();
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-gray-800 rounded-lg p-8 border border-gray-700">
        <h1 className="text-2xl font-bold text-white text-center mb-6">
          Stock Battle Royale
        </h1>

        <div className="flex space-x-2 mb-6">
          <button
            onClick={() => setMode('select')}
            className={`flex-1 py-2 rounded-md font-medium transition-colors ${
              mode === 'select'
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Select User
          </button>
          <button
            onClick={() => setMode('register')}
            className={`flex-1 py-2 rounded-md font-medium transition-colors ${
              mode === 'register'
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Register
          </button>
        </div>

        {mode === 'select' ? (
          <div className="space-y-3">
            {users && users.length > 0 ? (
              users.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleSelectUser(user.id)}
                  className="w-full bg-gray-700 hover:bg-gray-600 text-left px-4 py-3 rounded-md transition-colors"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-white font-medium">{user.username}</span>
                    <span className="text-green-400">
                      ${user.totalValue.toLocaleString()}
                    </span>
                  </div>
                </button>
              ))
            ) : (
              <p className="text-gray-400 text-center py-4">
                No users yet. Register to get started!
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Enter username"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Enter email"
              />
            </div>

            <div className="bg-gray-700/50 rounded p-3 text-sm text-gray-400">
              New users receive $100,000 starting cash
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-md font-medium disabled:opacity-50"
            >
              {registerMutation.isPending ? 'Registering...' : 'Register'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
