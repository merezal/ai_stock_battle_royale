import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { getCompanies, getBotStatus, getBotPrompt, getLeaderboard, type BotStatus } from '../api/client';
import type { Company } from '../types';
import { useAnimSettings } from '../hooks/useAnimSettings';
import { AnimSettingsPanel } from './AnimSettingsPanel';
import { HairlineReveal } from './WsAnimations';
import { useSocket } from '../context/SocketContext';

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
  onGearClick,
  gearOpen,
}: {
  operator: string;
  isRunning: boolean;
  onLogout: () => void;
  onGearClick: () => void;
  gearOpen: boolean;
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

      {/* Motion settings */}
      <button
        onClick={onGearClick}
        aria-label="Animation settings"
        title="Motion settings"
        style={{
          width: 28, height: 28,
          background: gearOpen ? 'var(--fg)' : 'transparent',
          color: gearOpen ? 'var(--bg)' : 'var(--fg-muted)',
          border: '1px solid var(--border)', borderRadius: 0,
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out)',
          flexShrink: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

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
  isAdmin,
}: {
  active: string;
  entityCount: number;
  mandateCount: number;
  operatorCount: number;
  isAdmin: boolean;
}) {
  const items = [
    { key: '/',             label: 'Market',    count: entityCount > 0 ? String(entityCount).padStart(3, '0') : null },
    { key: '/portfolio',    label: 'Portfolio', count: null },
    { key: '/bot',          label: 'Mandates',  count: mandateCount > 0 ? String(mandateCount).padStart(2, '0') : null },
    { key: '/leaderboard',  label: 'Operators', count: operatorCount > 0 ? String(operatorCount) : null },
    { key: '/posts',        label: 'Feed',      count: null },
    ...(isAdmin ? [{ key: '/admin', label: 'Admin', count: null }] : []),
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

function CommandBar({ companies, lastEvent }: { companies: Company[]; lastEvent: string | null }) {
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
      <span style={{ flexShrink: 0 }}>⌘K</span>
      <span style={{ color: 'var(--fg-subtle)', flexShrink: 0 }}>·</span>
      <span style={{ minWidth: 180, maxWidth: 320, overflow: 'hidden', color: 'var(--fg)', flexShrink: 0 }}>
        {lastEvent && <HairlineReveal text={lastEvent} trigger={lastEvent} />}
      </span>
      <span style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap' }}>
        <span style={{ display: 'inline-block', animation: 'sr-tick 60s linear infinite' }}>
          {(ticker + ticker + ticker)}
        </span>
      </span>
    </footer>
  );
}

// ── MobileNav ──────────────────────────────────────────────────

function MobileNav({ active, isAdmin }: { active: string; isAdmin: boolean }) {
  const items = [
    { key: '/',            label: 'Market' },
    { key: '/portfolio',   label: 'Portfolio' },
    { key: '/bot',         label: 'Mandates' },
    { key: '/leaderboard', label: 'Operators' },
    { key: '/posts',       label: 'Feed' },
    ...(isAdmin ? [{ key: '/admin', label: 'Admin' }] : []),
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
  const [animSettings, setAnimSetting, resetAnimSettings] = useAnimSettings();
  const [animPanelOpen, setAnimPanelOpen] = useState(false);

  useEffect(() => {
    window.__SR_ANIM = {
      ...window.__SR_ANIM,
      ...animSettings,
      scrambleDurMs:  animSettings.enableDecrypt   ? animSettings.scrambleDurMs  : 0,
      digitRollDurMs: animSettings.enableDigitRoll ? animSettings.digitRollDurMs : 0,
      flashDurMs:     animSettings.enableTickFlash ? animSettings.flashDurMs     : 0,
      flipDurMs:      animSettings.enableFlip      ? animSettings.flipDurMs      : 0,
    };
  }, [animSettings]);

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

  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;
    const set = setLastEvent;
    socket.on('companies:updated',  ()  => set('Market data updated.'));
    socket.on('leaderboard:updated',()  => set('Leaderboard updated.'));
    socket.on('posts:updated',      ()  => set('New post in feed.'));
    socket.on('transactions:new',   (p: { ticker?: string }) =>
      set(p.ticker ? `New transaction · ${p.ticker}` : 'New transaction.'));
    socket.on('portfolio:updated',  (p: { username: string }) =>
      set(`Portfolio updated · @${p.username}`));
    socket.on('bot:log',            (p: { actionType: string }) =>
      set(p.actionType === 'assistant_message' ? 'Agent reasoning...' : `Agent · ${p.actionType}`));
    socket.on('bot:status',         (p: { loopRunning: boolean }) =>
      set(p.loopRunning ? 'Loop started.' : 'Loop stopped.'));
    return () => {
      socket.off('companies:updated');
      socket.off('leaderboard:updated');
      socket.off('posts:updated');
      socket.off('transactions:new');
      socket.off('portfolio:updated');
      socket.off('bot:log');
      socket.off('bot:status');
    };
  }, [socket]);

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
        onGearClick={() => setAnimPanelOpen(o => !o)}
        gearOpen={animPanelOpen}
      />
      <div className="sr-layout-body" style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Sidebar
          active={active}
          entityCount={companies.length}
          mandateCount={mandateCount}
          operatorCount={leaderboard.length}
          isAdmin={user?.isAdmin ?? false}
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
      <CommandBar companies={companies} lastEvent={lastEvent} />
      <MobileNav active={active} isAdmin={user?.isAdmin ?? false} />
      <AnimSettingsPanel
        open={animPanelOpen}
        onClose={() => setAnimPanelOpen(false)}
        settings={animSettings}
        set={setAnimSetting}
        reset={resetAnimSettings}
      />
    </div>
  );
}
