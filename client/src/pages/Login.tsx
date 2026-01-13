import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { registerUser, loginUser } from '../api/client';
import { useCurrentUser } from '../hooks/useCurrentUser';

export function Login() {
  const navigate = useNavigate();
  const { setUserId } = useCurrentUser();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const loginMutation = useMutation({
    mutationFn: () => loginUser(username, password),
    onSuccess: (data) => {
      localStorage.setItem('token', data.token);
      localStorage.setItem('userId', data.id.toString());
      localStorage.setItem('username', data.username);
      setUserId(data.id);
      navigate('/');
    },
    onError: (err: Error) => setError(err.message),
  });

  const registerMutation = useMutation({
    mutationFn: () => registerUser(username, password),
    onSuccess: (data) => {
      localStorage.setItem('token', data.token);
      localStorage.setItem('userId', data.id.toString());
      localStorage.setItem('username', data.username);
      setUserId(data.id);
      navigate('/');
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Username and password are required');
      return;
    }
    setError('');
    loginMutation.mutate();
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Username and password are required');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    setError('');
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
            onClick={() => {
              setMode('login');
              setError('');
            }}
            className={`flex-1 py-2 rounded-md font-medium transition-colors ${
              mode === 'login'
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Login
          </button>
          <button
            onClick={() => {
              setMode('register');
              setError('');
            }}
            className={`flex-1 py-2 rounded-md font-medium transition-colors ${
              mode === 'register'
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Enter username"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Enter password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {mode === 'register' && (
            <div className="bg-gray-700/50 rounded p-3 text-sm text-gray-400">
              New users receive $100,000 starting cash. Password must be at least 8 characters.
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loginMutation.isPending || registerMutation.isPending}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-md font-medium disabled:opacity-50"
          >
            {mode === 'login'
              ? loginMutation.isPending ? 'Logging in...' : 'Login'
              : registerMutation.isPending ? 'Registering...' : 'Register'}
          </button>
        </form>
      </div>
    </div>
  );
}
