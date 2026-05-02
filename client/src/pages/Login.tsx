import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Credentials required.');
      return;
    }
    if (mode === 'register' && password.length < 8) {
      setError('Password must be ≥ 8 characters.');
      return;
    }
    setError('');
    if (mode === 'login') {
      loginMutation.mutate();
    } else {
      registerMutation.mutate();
    }
  };

  const isPending = loginMutation.isPending || registerMutation.isPending;

  return (
    <div
      data-theme="dark"
      style={{
        minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)',
        position: 'relative',
      }}
    >
      {/* Grid background */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.35,
        backgroundImage: 'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
        maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
      }} />

      {/* Back to landing */}
      <Link to="/" style={{
        position: 'absolute', top: 24, left: 24,
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--fg-muted)', textDecoration: 'none',
      }}>← Back</Link>

      <div style={{
        width: '100%', maxWidth: 420, position: 'relative',
        border: '1px solid var(--border-strong)', background: 'var(--bg)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span className="t-mark" style={{ fontSize: 13 }}>STOCK ROYALE</span>
          <span className="t-label">Operator access</span>
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {(['login', 'register'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); }}
              style={{
                flex: 1, padding: '10px 0',
                fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 500,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                background: mode === m ? 'var(--bg-elevated)' : 'transparent',
                color: mode === m ? 'var(--fg)' : 'var(--fg-muted)',
                border: 0, borderRight: m === 'login' ? '1px solid var(--border)' : 0,
                cursor: 'pointer',
              }}
            >
              {m === 'login' ? 'Authenticate' : 'Register'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Handle field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="t-label">Operator handle</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 13,
                background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
                color: 'var(--fg)', padding: '10px 12px', borderRadius: 0,
                outline: 0, width: '100%',
              }}
              placeholder="handle"
            />
          </div>

          {/* Password field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="t-label">Passphrase</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 13,
                background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
                color: 'var(--fg)', padding: '10px 12px', borderRadius: 0,
                outline: 0, width: '100%',
              }}
              placeholder="••••••••"
            />
          </div>

          {mode === 'register' && (
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)',
              padding: 12, background: 'var(--bg-sunken)', border: '1px solid var(--border)',
            }}>
              ∴ New operators receive § 100,000 starting capital. Passphrase ≥ 8 characters.
            </div>
          )}

          {error && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--state-loss)' }}>
              ERR / {error}
            </span>
          )}

          <button
            type="submit"
            disabled={isPending}
            style={{
              fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 12,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              height: 44, padding: '0 16px', borderRadius: 0,
              background: 'var(--fg)', color: 'var(--bg)',
              border: '1px solid var(--fg)',
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.5 : 1,
              transition: 'opacity var(--dur-1) var(--ease-out)',
            }}
          >
            {isPending ? 'Processing...' : mode === 'login' ? 'Authenticate →' : 'Register operator →'}
          </button>
        </form>
      </div>
    </div>
  );
}
