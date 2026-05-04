import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCompanies, loginUser } from '../api/client';
import { fmt } from '../utils/format';
import { useCurrentUser } from '../hooks/useCurrentUser';
import type { Company } from '../types';

// ── Auto-enter hook ────────────────────────────────────────────
// Attempts a silent login with empty credentials.
// Demo backend accepts anything → auto-auths. Prod rejects → falls back to /login.

function useAutoEnter() {
  const navigate = useNavigate();
  const { setUserId } = useCurrentUser();
  return useCallback(async () => {
    try {
      const data = await loginUser('', '');
      localStorage.setItem('token', data.token);
      setUserId(data.id);
      navigate('/');
    } catch {
      navigate('/login');
    }
  }, [navigate, setUserId]);
}

// ── Shared primitives ──────────────────────────────────────────

function Btn({
  to,
  href,
  onClick,
  variant = 'primary',
  size = 'md',
  children,
}: {
  to?: string;
  href?: string;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'invert';
  size?: 'md' | 'lg';
  children: React.ReactNode;
}) {
  const sizes = {
    md: { fontSize: 13, height: 44, padding: '0 20px' },
    lg: { fontSize: 14, height: 52, padding: '0 24px' },
  };
  const variants: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--fg)', color: 'var(--bg)', borderColor: 'var(--fg)' },
    ghost:   { background: 'transparent', color: 'var(--fg)', borderColor: 'var(--border-strong)' },
    invert:  { background: 'var(--bg)', color: 'var(--fg)', borderColor: 'var(--bg)' },
  };
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    fontFamily: 'var(--font-display)', fontWeight: 500,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    border: '1px solid', textDecoration: 'none',
    cursor: 'pointer', background: 'none',
    transition: 'opacity var(--dur-1) var(--ease-out), background var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out), border-color var(--dur-1) var(--ease-out)',
    borderRadius: 0,
    ...sizes[size], ...variants[variant],
  };
  const cls = `sr-cta-${variant}`;
  if (onClick) return <button type="button" onClick={onClick} className={cls} style={base}>{children}</button>;
  if (to) return <Link to={to} className={cls} style={base}>{children}</Link>;
  return <a href={href ?? '#'} className={cls} style={base}>{children}</a>;
}

function Section({
  children,
  label,
  theme,
  style,
  id,
}: {
  children: React.ReactNode;
  label?: string;
  theme?: 'light' | 'dark';
  style?: React.CSSProperties;
  id?: string;
}) {
  return (
    <section
      id={id}
      data-theme={theme}
      style={{ background: 'var(--bg)', color: 'var(--fg)', padding: 'clamp(32px, 5vh, 80px) clamp(16px, 4vw, 48px)', position: 'relative', scrollMarginTop: 64, ...style }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        {label && (
          <div className="t-label" style={{ marginBottom: 'clamp(24px, 4vh, 48px)', paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
            {label}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

// ── Header ─────────────────────────────────────────────────────

function Header() {
  const [scrolled, setScrolled] = useState(false);
  const handleEnter = useAutoEnter();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 80);
    window.addEventListener('scroll', handler, { passive: true });
    handler();
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <header
      data-theme={scrolled ? 'light' : 'dark'}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        height: 64, padding: '0 24px',
        display: 'flex', alignItems: 'center',
        background: scrolled ? 'var(--bg)' : 'transparent',
        borderBottom: scrolled ? '1px solid var(--border)' : '1px solid transparent',
        transition: 'background var(--dur-2) var(--ease-out), border-color var(--dur-2) var(--ease-out)',
      }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto', width: '100%', display: 'flex', alignItems: 'center', gap: 32 }}>
        <span className="t-mark" style={{ fontSize: 14, color: 'var(--fg)' }}>STOCK ROYALE</span>
        <nav className="sr-header-nav" style={{ display: 'flex', gap: 24, marginLeft: 32, fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {['Manifesto', 'Mechanics', 'Entities'].map(l => (
            <a
              key={l}
              href={`#${l.toLowerCase()}`}
              className="sr-landing-nav"
              style={{ color: 'var(--fg-muted)', textDecoration: 'none', transition: 'color var(--dur-1) var(--ease-out)' }}
            >{l}</a>
          ))}
        </nav>
        <span style={{ flex: 1 }} />
        <Btn onClick={handleEnter} variant="ghost" size="md">Enter →</Btn>
      </div>
    </header>
  );
}

// ── Hero ───────────────────────────────────────────────────────

function Hero() {
  const handleEnter = useAutoEnter();
  return (
    <section
      data-theme="dark"
      style={{
        background: 'var(--bg)', color: 'var(--fg)',
        minHeight: '100dvh', position: 'relative', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        padding: '120px 24px 64px',
      }}
    >
      {/* Hairline grid */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5,
        backgroundImage: 'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
        backgroundSize: '96px 96px',
        maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
      }} />
      {/* Stamp watermark */}
      <img
        src="/brand/stock-royale-stamp.svg"
        alt=""
        style={{
          position: 'absolute', right: -120, top: '50%',
          transform: 'translateY(-50%)', width: 720, opacity: 0.12,
          filter: 'invert(1)', pointerEvents: 'none',
        }}
      />
      {/* Content */}
      <div style={{ maxWidth: 1280, margin: '0 auto', width: '100%', position: 'relative' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginBottom: 96,
          fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)',
        }}>
          <span>◼ SYNTHETIC EXCHANGE</span>
          <span>EST. 2026 — 12ms ±2</span>
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 500,
          fontSize: 'clamp(56px, 9vw, 144px)', lineHeight: 0.95,
          letterSpacing: '-0.03em', maxWidth: 1100, margin: 0,
        }}>
          A market<br />
          <span style={{ color: 'var(--fg-subtle)' }}>mediated by</span><br />
          language.
        </h1>
        <div className="sr-hero-bottom" style={{
          marginTop: 48, display: 'flex', alignItems: 'flex-end',
          justifyContent: 'space-between', flexWrap: 'wrap', gap: 32,
        }}>
          <p style={{ maxWidth: 480, color: 'var(--fg-muted)', fontSize: 16, lineHeight: 1.5, margin: 0 }}>
            STOCK ROYALE is a synthetic stock exchange. Operators found entities, distribute shares, and write the prompts that drive autonomous trading agents. The market that emerges is yours.
          </p>
          <div className="sr-hero-ctas" style={{ display: 'flex', gap: 12 }}>
            <Btn onClick={handleEnter} size="lg">Enter →</Btn>
            <Btn href="#manifesto" size="lg" variant="ghost">Read manifesto</Btn>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Manifesto ──────────────────────────────────────────────────

function Manifesto() {
  return (
    <Section id="manifesto" label="01 / Manifesto" theme="light">
      <div style={{ maxWidth: 960 }}>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontWeight: 500,
          fontSize: 'clamp(24px, 3vw, 52px)', lineHeight: 1.1,
          letterSpacing: '-0.02em', margin: 0, marginBottom: 'clamp(20px, 3vh, 40px)', textWrap: 'pretty',
        }}>
          Real markets are slow. Reflexes are dulled by regulation, latency, and people. STOCK ROYALE is a place where the price is the prompt — where every operator competes to write the most decisive paragraph.
        </h2>
        <div className="sr-manifesto-grid" style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32,
          paddingTop: 'clamp(20px, 3vh, 40px)', borderTop: '1px solid var(--border)',
        }}>
          {[
            'Found an entity. Issue shares.',
            'Write a mandate. Deploy an agent.',
            'Watch the market it creates.',
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="t-label">{'0' + (i + 1)}</div>
              <p style={{ fontSize: 18, lineHeight: 1.4, margin: 0 }}>{t}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ── How It Works ───────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    { n: '01', label: 'Found', body: 'Declare an entity. Set its initial supply. Distribute the first shares.', code: '$ royale entity new' },
    { n: '02', label: 'Mandate', body: 'Write a paragraph that defines how an agent should trade. Be explicit about entity, conditions, and limits.', code: '$ royale mandate deploy' },
    { n: '03', label: 'Settle', body: 'The agent reads the ledger and routes orders. The market that emerges is the residue of every mandate submitted today.', code: '$ royale ledger watch' },
  ];
  return (
    <Section id="mechanics" label="02 / Mechanics" theme="light">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0 }}>
        {steps.map((s, i) => (
          <div className="sr-how-step" key={s.n} style={{
            display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 32,
            padding: 'clamp(24px, 4vh, 48px) 0',
            borderTop: '1px solid var(--border)',
            borderBottom: i === steps.length - 1 ? '1px solid var(--border)' : 'none',
            alignItems: 'start',
          }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(36px, 4vw, 64px)', fontWeight: 500, lineHeight: 1, color: 'var(--fg)' }}>{s.n}</div>
              <div className="t-label" style={{ marginTop: 12 }}>{s.label}</div>
            </div>
            <p style={{ fontSize: 24, lineHeight: 1.35, margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-0.01em', textWrap: 'pretty' }}>
              {s.body}
            </p>
            <div className="sr-how-code" style={{
              background: 'var(--bg-sunken)', border: '1px solid var(--border)',
              padding: 16, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg-muted)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div className="t-label">Operator console</div>
              <div style={{ color: 'var(--fg)' }}>{s.code}</div>
              <div>◼ ok</div>
              <div>∴ committed</div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Entity Ticker ──────────────────────────────────────────────

function EntityTicker({ companies }: { companies: Company[] }) {
  const rows = companies.length > 0
    ? companies.slice(0, 8).map(c => ({
        sym: c.ticker,
        val: fmt(c.currentPrice),
        name: c.companyName,
      }))
    : [
        { sym: 'SOLARIS.IND', val: '§ 1,284.30', name: 'Solaris Industrial' },
        { sym: 'HALCYON.LBR', val: '§   872.05', name: 'Halcyon Labor Pool' },
        { sym: 'OBELISK.ARC', val: '§ 4,002.00', name: 'Obelisk Architecture' },
        { sym: 'VESTA.LIQ',   val: '§   118.92', name: 'Vesta Liquidity' },
      ];
  const all = [...rows, ...rows, ...rows];

  return (
    <section
      id="entities"
      data-theme="dark"
      style={{
        background: 'var(--bg)', color: 'var(--fg)',
        padding: '96px 0', overflow: 'hidden',
        borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ padding: '0 24px', maxWidth: 1280, margin: '0 auto' }}>
        <div className="t-label" style={{ marginBottom: 32, color: 'var(--fg-muted)' }}>
          03 / Open entities · live
        </div>
      </div>
      <div style={{ display: 'flex', gap: 0, animation: 'sr-scroll-x 60s linear infinite', whiteSpace: 'nowrap' }}>
        {all.map((r, i) => (
          <div key={`${r.sym}-${i}`} style={{
            flex: '0 0 auto', minWidth: 260,
            padding: '24px 32px',
            borderRight: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div className="t-label" style={{ color: 'var(--fg-muted)' }}>◼ OPEN</div>
            <div className="t-mark" style={{ fontSize: 16 }}>{r.sym}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 22 }}>{r.val}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>{r.name}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── CTA ────────────────────────────────────────────────────────

function CTA() {
  const handleEnter = useAutoEnter();
  return (
    <section style={{ background: 'var(--bg)', color: 'var(--fg)', padding: 'clamp(64px, 10vh, 160px) 24px', textAlign: 'left' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div className="t-label" style={{ marginBottom: 48, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          04 / Enter
        </div>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontWeight: 500,
          fontSize: 'clamp(56px, 9vw, 144px)', lineHeight: 0.95,
          letterSpacing: '-0.03em', margin: 0,
        }}>
          Write the<br />
          <span style={{ color: 'var(--fg-subtle)' }}>paragraph that</span><br />
          moves the market.
        </h2>
        <div style={{ marginTop: 48, display: 'flex', gap: 12 }}>
          <Btn onClick={handleEnter} size="lg">Request operator access →</Btn>
          <Btn href="#mechanics" size="lg" variant="ghost">Read mandate spec</Btn>
        </div>
      </div>
    </section>
  );
}

// ── Footer ─────────────────────────────────────────────────────

function FooterCol({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="t-label" style={{ marginBottom: 16 }}>{title}</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => (
          <li key={item}>
            <a href="#" className="sr-footer-link" style={{ color: 'var(--fg)', textDecoration: 'none', fontSize: 13, transition: 'color var(--dur-1) var(--ease-out)' }}>{item}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Footer() {
  return (
    <footer
      data-theme="dark"
      style={{ background: 'var(--bg)', color: 'var(--fg)', padding: '64px 24px 32px', borderTop: '1px solid var(--border)' }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div className="sr-footer-grid" style={{
          display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 32,
          paddingBottom: 48, borderBottom: '1px solid var(--border)',
        }}>
          <div className="sr-footer-brand">
            <div className="t-mark" style={{ fontSize: 14 }}>STOCK ROYALE</div>
            <p style={{ color: 'var(--fg-muted)', fontSize: 13, marginTop: 12, maxWidth: 320 }}>
              A synthetic exchange. Operator-founded entities, agent-mediated price discovery.
            </p>
          </div>
          <FooterCol title="Surface" items={['Terminal', 'Documentation', 'Mandate spec', 'API']} />
          <FooterCol title="Operators" items={['Sign in', 'Register', 'Status']} />
          <FooterCol title="About" items={['Manifesto', 'Privacy', 'Risk advisory']} />
        </div>
        <div style={{
          marginTop: 32, display: 'flex', justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)',
          flexWrap: 'wrap', gap: 12,
        }}>
          <span>EST. 2026</span>
          <span>STOCK ROYALE is not a regulated exchange. § are synthetic credits with no real-world value.</span>
          <span>© 2026 STOCK ROYALE</span>
        </div>
      </div>
    </footer>
  );
}

// ── Page ───────────────────────────────────────────────────────

export function Landing() {
  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: getCompanies,
    staleTime: 30000,
  });

  return (
    <div data-theme="dark" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
      <Header />
      <Hero />
      <Manifesto />
      <HowItWorks />
      <EntityTicker companies={companies} />
      <CTA />
      <Footer />
    </div>
  );
}
