import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { getCompanies, getBotStatus, getBotPrompt, getLeaderboard, type BotStatus } from '../api/client';
import type { Company } from '../types';

// ── Clock ──────────────────────────────────────────────────────

function useClock() {
  const [time, setTime] = useState(() => new Date().toISOString().slice(11, 19) + ' UTC');
  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toISOString().slice(11, 19) + ' UTC');
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

// ── TopBar ─────────────────────────────────────────────────────

function TopBar({
  operator,
  isRunning,
  onLogout,
}: {
  operator: string;
  isRunning: boolean;
  onLogout: () => void;
}) {
  const clock = useClock();

  return (
    <header style={{
      height: 40, flexShrink: 0,
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg)',
      display: 'flex', alignItems: 'center',
      padding: '0 12px', gap: 16,
      fontFamily: 'var(--font-mono)', fontSize: 12,
      zIndex: 10,
    }}>
      <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
        <span className="t-mark" style={{ fontSize: 13 }}>STOCK ROYALE</span>
      </Link>
      <span style={{ color: 'var(--fg-subtle)' }}>/</span>
      <span className="sr-topbar-label t-label">Synthetic exchange</span>
      <span style={{ flex: 1 }} />

      {/* Market state badge */}
      <span style={{
        fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 11,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        padding: '4px 8px',
        border: '1px solid',
        display: 'inline-flex', gap: 6, alignItems: 'center',
        background: isRunning ? 'var(--fg)' : 'transparent',
        color: isRunning ? 'var(--bg)' : 'var(--fg-muted)',
        borderColor: isRunning ? 'var(--fg)' : 'var(--border-strong)',
      }}>
        <span style={{
          width: 6, height: 6, background: 'currentColor',
          animation: isRunning ? 'sr-pulse 1.6s ease-in-out infinite' : 'none',
        }} />
        {isRunning ? 'Market open' : 'Market closed'}
      </span>

      <span className="sr-topbar-operator" style={{ color: 'var(--fg-muted)' }}>
        OPERATOR / <span style={{ color: 'var(--fg)' }}>{operator}</span>
      </span>

      <span className="sr-topbar-clock t-num muted">{clock}</span>

      <button
        onClick={onLogout}
        className="sr-exit-btn"
        style={{
          fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 500,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          background: 'transparent', color: 'var(--fg-muted)',
          border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 0,
          cursor: 'pointer',
          transition: 'color var(--dur-1) var(--ease-out)',
        }}
      >
        Exit
      </button>
    </header>
  );
}

// ── Sidebar ────────────────────────────────────────────────────

function Sidebar({
  active,
  entityCount,
  mandateCount,
  operatorCount,
}: {
  active: string;
  entityCount: number;
  mandateCount: number;
  operatorCount: number;
}) {
  const items = [
    { key: '/',             label: 'Market',    count: entityCount > 0 ? String(entityCount).padStart(3, '0') : null },
    { key: '/portfolio',    label: 'Portfolio', count: null },
    { key: '/bot',          label: 'Mandates',  count: mandateCount > 0 ? String(mandateCount).padStart(2, '0') : null },
    { key: '/leaderboard',  label: 'Operators', count: operatorCount > 0 ? String(operatorCount) : null },
    { key: '/posts',        label: 'Feed',      count: null },
  ];

  return (
    <aside className="sr-sidebar" style={{
      width: 200, flexShrink: 0,
      borderRight: '1px solid var(--border)',
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
        <div className="t-label">Surface</div>
      </div>
      <nav style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {items.map(it => (
          <Link
            key={it.key}
            to={it.key}
            className="sr-nav-link"
            style={{
              background: active === it.key ? 'var(--bg-elevated)' : 'transparent',
              color: active === it.key ? 'var(--fg)' : 'var(--fg-muted)',
              padding: '10px 12px',
              fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 500,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              textDecoration: 'none',
              transition: 'background var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out)',
            }}
          >
            <span>{it.label}</span>
            {it.count && <span style={{ color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)' }}>{it.count}</span>}
          </Link>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      <div style={{
        padding: 16, borderTop: '1px solid var(--border)',
        fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <div>BUILD / <span style={{ color: 'var(--fg)' }}>1.2.0</span></div>
        <div>NODE / LOCAL</div>
      </div>
    </aside>
  );
}

// ── CommandBar ─────────────────────────────────────────────────

function CommandBar({ companies }: { companies: Company[] }) {
  const ticker = companies.length > 0
    ? companies.map(c =>
        `   ${c.ticker} § ${c.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   `
      ).join('') + '   '
    : '   STOCK ROYALE · SYNTHETIC EXCHANGE   ';

  return (
    <footer className="sr-cmdbar" style={{
      height: 32, flexShrink: 0,
      borderTop: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      padding: '0 12px', gap: 12,
      fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)',
      background: 'var(--bg)',
      overflow: 'hidden',
    }}>
      <span style={{ color: 'var(--fg)' }}>/</span>
      <span>⌘K command</span>
      <span style={{ color: 'var(--fg-subtle)' }}>·</span>
      <span>? help</span>
      <span style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap' }}>
        <span style={{ display: 'inline-block', animation: 'sr-tick 60s linear infinite' }}>
          {(ticker + ticker + ticker)}
        </span>
      </span>
    </footer>
  );
}

// ── MobileNav ──────────────────────────────────────────────────

function MobileNav({ active }: { active: string }) {
  const items = [
    { key: '/',            label: 'Market' },
    { key: '/portfolio',   label: 'Portfolio' },
    { key: '/bot',         label: 'Mandates' },
    { key: '/leaderboard', label: 'Operators' },
    { key: '/posts',       label: 'Feed' },
  ];
  return (
    <nav className="sr-mobile-nav" style={{ padding: '0 8px' }}>
      {items.map(it => (
        <Link
          key={it.key}
          to={it.key}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 3, textDecoration: 'none',
            fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 500,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: active === it.key ? 'var(--fg)' : 'var(--fg-muted)',
            borderTop: active === it.key ? '1px solid var(--fg)' : '1px solid transparent',
            marginTop: -1, paddingTop: 8,
          }}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

// ── Layout ─────────────────────────────────────────────────────

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, setUserId } = useCurrentUser();

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['companies'],
    queryFn: getCompanies,
  });

  const { data: botStatus } = useQuery<BotStatus>({
    queryKey: ['botStatus'],
    queryFn: getBotStatus,
    staleTime: Infinity,
  });

  const { data: botPrompt } = useQuery({
    queryKey: ['botPrompt', user?.id],
    queryFn: getBotPrompt,
    enabled: !!user?.id,
  });

  const { data: leaderboard = [] } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: getLeaderboard,
    staleTime: 30000,
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('currentUserId');
    setUserId(null);
    navigate('/');
  };

  const active = location.pathname === '/' ? '/' : '/' + location.pathname.split('/')[1];
  const mandateCount = botPrompt?.isActive ? 1 : 0;

  return (
    <div
      data-theme="dark"
      className="sr-layout-root"
      style={{
        display: 'flex', flexDirection: 'column',
        height: '100dvh', overflow: 'hidden',
        background: 'var(--bg)', color: 'var(--fg)',
      }}
    >
      <TopBar
        operator={user?.username ?? '—'}
        isRunning={botStatus?.loopRunning ?? false}
        onLogout={handleLogout}
      />
      <div className="sr-layout-body" style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Sidebar
          active={active}
          entityCount={companies.length}
          mandateCount={mandateCount}
          operatorCount={leaderboard.length}
        />
        <main className="sr-layout-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'auto', position: 'relative' }}>
          <img
            src="/brand/stock-royale-stamp.svg"
            alt=""
            className="sr-bg-stamp"
            style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 480, opacity: 0.1, pointerEvents: 'none',
              filter: 'invert(1)', zIndex: 0,
            }}
          />
          <div className="sr-layout-inner" style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <Outlet />
          </div>
        </main>
      </div>
      <CommandBar companies={companies} />
      <MobileNav active={active} />
    </div>
  );
}
