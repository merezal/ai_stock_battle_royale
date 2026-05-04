import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';

// ── Global config ────────────────────────────────────────────
// Primitives read from window.__SR_ANIM so the AnimSettingsPanel
// can tune them at runtime without prop-drilling.

declare global {
  interface Window {
    __SR_ANIM?: Partial<SrAnimConfig>;
  }
}

export interface SrAnimConfig {
  scrambleCharset: string;
  scrambleDurMs: number;
  scrambleStaggerMs: number;
  scrambleTickMs: number;
  digitRollDurMs: number;
  digitGlyphHeight: number;
  flashDurMs: number;
  hairlineGrowDurMs: number;
  contentRiseDurMs: number;
  flipDurMs: number;
  statusFlashDurMs: number;
}

const DEFAULTS: SrAnimConfig = {
  scrambleCharset: '█▓▒░·▪◼◻∴∅±/[](){}<>0123456789ABCDEF',
  scrambleDurMs: 720,
  scrambleStaggerMs: 18,
  scrambleTickMs: 28,
  digitRollDurMs: 380,
  digitGlyphHeight: 18,
  flashDurMs: 240,
  hairlineGrowDurMs: 280,
  contentRiseDurMs: 320,
  flipDurMs: 480,
  statusFlashDurMs: 480,
};

function cfg<K extends keyof SrAnimConfig>(k: K): SrAnimConfig[K] {
  const v = window.__SR_ANIM?.[k];
  return (v != null ? v : DEFAULTS[k]) as SrAnimConfig[K];
}

// ── Decrypt ──────────────────────────────────────────────────
// Each character scrambles through a charset then resolves to its
// final glyph at a staggered offset. Used for newly-arrived text.

export function Decrypt({
  text,
  trigger,
  charset,
  durMs,
  staggerMs,
  tickMs,
  style,
  className,
}: {
  text: string;
  trigger?: unknown;
  charset?: string;
  durMs?: number;
  staggerMs?: number;
  tickMs?: number;
  style?: CSSProperties;
  className?: string;
}) {
  const [out, setOut] = useState(text);
  const rafRef = useRef<number>(0);
  const startRef = useRef(0);
  const lastTickRef = useRef(0);

  useEffect(() => {
    const cs = charset ?? cfg('scrambleCharset');
    const total = durMs ?? cfg('scrambleDurMs');
    const stagger = staggerMs ?? cfg('scrambleStaggerMs');
    const tick = tickMs ?? cfg('scrambleTickMs');
    const target = String(text);

    if (!target || total === 0) { setOut(target); return; }

    startRef.current = performance.now();
    lastTickRef.current = 0;

    const step = (now: number) => {
      const elapsed = now - startRef.current;
      if (now - lastTickRef.current < tick && elapsed < total) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }
      lastTickRef.current = now;

      let s = '';
      for (let i = 0; i < target.length; i++) {
        const ch = target[i];
        if (ch === ' ' || ch === '\n') { s += ch; continue; }
        const resolveAt = i * stagger;
        if (elapsed >= resolveAt + (total - target.length * stagger)) {
          s += ch;
        } else {
          s += cs[Math.floor(Math.random() * cs.length)];
        }
      }
      setOut(s);

      if (elapsed < total) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setOut(target);
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, trigger]);

  return <span className={className} style={style}>{out}</span>;
}

// ── DigitRoll ────────────────────────────────────────────────
// Each glyph slot is a vertical strip of [old, new]. On value
// change, the strip translates up by one cell height.

function splitChars(s: string): string[] { return Array.from(String(s)); }

function padLeft(arr: string[], len: number, fill: string): string[] {
  if (arr.length >= len) return arr;
  return [...new Array(len - arr.length).fill(fill), ...arr];
}

export function DigitRoll({
  value,
  durMs,
  glyphH,
  style,
  className,
  prefix = '',
  suffix = '',
}: {
  value: string | number;
  durMs?: number;
  glyphH?: number;
  style?: CSSProperties;
  className?: string;
  prefix?: string;
  suffix?: string;
}) {
  const [chars, setChars] = useState(() => splitChars(prefix + String(value) + suffix));
  const prevRef = useRef(chars);
  const [stamp, setStamp] = useState(0);

  useEffect(() => {
    const next = splitChars(prefix + String(value) + suffix);
    prevRef.current = chars;
    setChars(next);
    setStamp(s => s + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const h = glyphH ?? cfg('digitGlyphHeight');
  const dur = durMs ?? cfg('digitRollDurMs');
  const prev = prevRef.current;
  const len = Math.max(chars.length, prev.length);
  const padPrev = padLeft(prev, len, ' ');
  const padNext = padLeft(chars, len, ' ');

  return (
    <span className={className} style={{
      display: 'inline-flex', overflow: 'hidden', height: h, lineHeight: `${h}px`,
      fontVariantNumeric: 'tabular-nums lining-nums',
      ...style,
    }}>
      {padNext.map((ch, i) => {
        const old = padPrev[i] ?? ' ';
        const same = old === ch;
        return (
          <span key={`${i}:${ch}:${stamp}`} style={{
            display: 'inline-block', height: h, position: 'relative',
            width: ch === ' ' ? '0.4em' : 'auto',
          }}>
            <span style={{
              display: 'flex', flexDirection: 'column',
              transform: same ? 'translateY(0)' : `translateY(-${h}px)`,
              transition: same ? 'none' : `transform ${dur}ms cubic-bezier(0.2,0.8,0.2,1)`,
            }}>
              <span style={{ height: h }}>{old === ' ' ? ' ' : old}</span>
              <span style={{ height: h }}>{ch === ' ' ? ' ' : ch}</span>
            </span>
          </span>
        );
      })}
    </span>
  );
}

// ── TickFlash ────────────────────────────────────────────────
// Inverse-flash on a cell when a numeric value changes.
// Up = white flash, down = loss-color flash.

export function TickFlash({
  value,
  children,
  durMs,
  style,
  className,
}: {
  value: number;
  children: ReactNode;
  durMs?: number;
  style?: CSSProperties;
  className?: string;
}) {
  const prevRef = useRef(value);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const dur = durMs ?? cfg('flashDurMs');

  useEffect(() => {
    const old = prevRef.current;
    if (old !== value) {
      const dir = value > old ? 'up' : 'down';
      setFlash(dir);
      const id = setTimeout(() => setFlash(null), dur);
      prevRef.current = value;
      return () => clearTimeout(id);
    }
    prevRef.current = value;
  }, [value, dur]);

  const flashStyle: CSSProperties = flash === 'up'
    ? { background: 'var(--fg)', color: 'var(--bg)' }
    : flash === 'down'
      ? { background: 'var(--state-loss)', color: 'var(--bg)' }
      : {};

  return (
    <span className={className} style={{
      display: 'inline-block',
      transition: `background ${dur}ms cubic-bezier(0.2,0.8,0.2,1), color ${dur}ms cubic-bezier(0.2,0.8,0.2,1)`,
      padding: '0 4px', margin: '0 -4px',
      ...flashStyle,
      ...style,
    }}>
      {children}
    </span>
  );
}

// ── HairlineRow ──────────────────────────────────────────────
// New table row: bottom border draws left→right, then content fades up.
// Renders as <tr>; wrap the row's <td> children inside.

export function HairlineRow({
  children,
  growMs,
  riseMs,
  style,
  onClick,
}: {
  children: ReactNode;
  growMs?: number;
  riseMs?: number;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const grow = growMs ?? cfg('hairlineGrowDurMs');
  const rise = riseMs ?? cfg('contentRiseDurMs');
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = requestAnimationFrame(() => setPhase(1));
    const t2 = setTimeout(() => setPhase(2), grow);
    return () => { cancelAnimationFrame(t1); clearTimeout(t2); };
  }, [grow]);

  return (
    <tr
      data-sr-row-anim={phase}
      onClick={onClick}
      style={{
        transition: `opacity ${rise}ms cubic-bezier(0.2,0.8,0.2,1), transform ${rise}ms cubic-bezier(0.2,0.8,0.2,1)`,
        opacity: phase >= 2 ? 1 : 0,
        transform: phase >= 2 ? 'translateY(0)' : 'translateY(4px)',
        ...style,
      }}
    >
      {children}
    </tr>
  );
}

// ── useFlip ──────────────────────────────────────────────────
// FLIP reorder: attach the returned ref to a list item. When `key`
// changes (e.g. rank changes), the item animates from its old
// position to its new one.

export function useFlip<T extends HTMLElement = HTMLTableRowElement>(
  key: unknown,
  durMs?: number,
) {
  const ref = useRef<T>(null);
  const lastRectRef = useRef<DOMRect | null>(null);
  const lastKeyRef = useRef(key);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dur = durMs ?? cfg('flipDurMs');

    if (lastKeyRef.current === key) {
      lastRectRef.current = el.getBoundingClientRect();
      return;
    }

    const newRect = el.getBoundingClientRect();
    const oldRect = lastRectRef.current;
    if (oldRect) {
      const dx = oldRect.left - newRect.left;
      const dy = oldRect.top - newRect.top;
      if (dx !== 0 || dy !== 0) {
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        void el.offsetWidth; // force reflow to commit the starting position
        el.style.transition = `transform ${dur}ms cubic-bezier(0.2,0.8,0.2,1)`;
        el.style.transform = 'translate(0,0)';
      }
    }
    lastRectRef.current = newRect;
    lastKeyRef.current = key;
  }, [key, durMs]);

  return ref;
}

// ── StatusFlash ──────────────────────────────────────────────
// One-shot invert filter when a status value changes.

export function StatusFlash({
  state,
  children,
  durMs,
  style,
}: {
  state: unknown;
  children: ReactNode;
  durMs?: number;
  style?: CSSProperties;
}) {
  const prev = useRef(state);
  const [flashing, setFlashing] = useState(false);
  const dur = durMs ?? cfg('statusFlashDurMs');

  useEffect(() => {
    if (prev.current !== state) {
      setFlashing(true);
      const id = setTimeout(() => setFlashing(false), dur);
      prev.current = state;
      return () => clearTimeout(id);
    }
  }, [state, dur]);

  return (
    <span style={{
      display: 'inline-block',
      transition: `filter ${dur}ms cubic-bezier(0.2,0.8,0.2,1)`,
      filter: flashing ? 'invert(1)' : 'invert(0)',
      ...style,
    }}>
      {children}
    </span>
  );
}

// ── FlashNew ─────────────────────────────────────────────────
// Mount-flash for newly-arrived items: inverted on mount, fades to
// transparent after flashDurMs. Wrap individual text spans in new rows.

export function FlashNew({
  children,
  durMs,
  style,
  className,
}: {
  children: ReactNode;
  durMs?: number;
  style?: CSSProperties;
  className?: string;
}) {
  const dur = durMs ?? cfg('flashDurMs');
  const [flash, setFlash] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setFlash(false), dur);
    return () => clearTimeout(id);
  }, [dur]);

  return (
    <span className={className} style={{
      display: 'inline-block',
      transition: `background ${dur}ms cubic-bezier(0.2,0.8,0.2,1), color ${dur}ms cubic-bezier(0.2,0.8,0.2,1)`,
      padding: '0 4px', margin: '0 -4px',
      background: flash ? 'var(--fg)' : 'transparent',
      color: flash ? 'var(--bg)' : 'inherit',
      ...style,
    }}>
      {children}
    </span>
  );
}

// ── useNewIds ────────────────────────────────────────────────
// Returns a Set of IDs that appeared after the first load.
// Null-sentinel: first population fills seenRef without marking as new.

export function useNewIds(ids: number[]): Set<number> {
  const seenRef = useRef<Set<number> | null>(null);
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const idsKey = ids.join(',');

  useEffect(() => {
    if (ids.length === 0 && seenRef.current === null) return;
    if (seenRef.current === null) {
      seenRef.current = new Set(ids);
      return;
    }
    const added = ids.filter(id => !seenRef.current!.has(id));
    ids.forEach(id => seenRef.current!.add(id));
    if (added.length === 0) return;
    setNewIds(prev => new Set([...prev, ...added]));
    const timer = setTimeout(() => {
      setNewIds(prev => {
        const next = new Set(prev);
        added.forEach(id => next.delete(id));
        return next;
      });
    }, 2000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return newIds;
}

// ── HairlineReveal ───────────────────────────────────────────
// Text appears with a 1px line sweeping left→right across it.
// Used for status copy and lighter-touch updates.

export function HairlineReveal({
  text,
  durMs,
  style,
  trigger,
}: {
  text: string;
  durMs?: number;
  style?: CSSProperties;
  trigger?: unknown;
}) {
  const dur = durMs ?? cfg('contentRiseDurMs');
  const [k, setK] = useState(0);
  useEffect(() => { setK(x => x + 1); }, [text, trigger]);

  return (
    <span key={k} style={{
      display: 'inline-block', position: 'relative',
      backgroundImage: 'linear-gradient(90deg, var(--fg) 0%, var(--fg) 100%)',
      backgroundSize: '0% 1px',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: '0 100%',
      animation: `sr-hairline-reveal ${dur}ms cubic-bezier(0.2,0.8,0.2,1) forwards`,
      ...style,
    }}>
      {text}
    </span>
  );
}
