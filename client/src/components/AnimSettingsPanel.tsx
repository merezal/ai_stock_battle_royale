import type { AnimSettings } from '../hooks/useAnimSettings';

type Setter = (k: keyof AnimSettings, v: AnimSettings[keyof AnimSettings]) => void;

function NumSlider({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ accentColor: 'var(--fg)', width: 110 }}
      />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg)', minWidth: 52, textAlign: 'right' }}>
        {value}ms
      </span>
    </span>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 32, height: 18, padding: 1,
        background: value ? 'var(--fg)' : 'transparent',
        border: `1px solid ${value ? 'var(--fg)' : 'var(--border-strong)'}`,
        borderRadius: 0, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center',
        justifyContent: value ? 'flex-end' : 'flex-start',
        transition: 'background var(--dur-1) var(--ease-out)',
      }}
    >
      <span style={{ width: 12, height: 12, background: value ? 'var(--bg)' : 'var(--fg-muted)' }} />
    </button>
  );
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr', gap: 4,
      padding: '10px 16px', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 500,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg)',
        }}>
          {label}
        </span>
        {children}
      </div>
      {hint && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)' }}>
          {hint}
        </span>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '12px 16px 6px',
      fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 500,
      letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-muted)',
    }}>
      {children}
    </div>
  );
}

const demoBtn: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 500,
  letterSpacing: '0.08em', textTransform: 'uppercase',
  padding: '8px 10px', background: 'transparent', color: 'var(--fg)',
  border: '1px solid var(--border-strong)', borderRadius: 0, cursor: 'pointer',
};

export function AnimSettingsPanel({
  open,
  onClose,
  settings,
  set,
  reset,
}: {
  open: boolean;
  onClose: () => void;
  settings: AnimSettings;
  set: Setter;
  reset: () => void;
}) {
  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', top: 52, right: 16, width: 360,
      maxHeight: 'calc(100dvh - 72px)', overflow: 'auto',
      background: 'var(--bg)', color: 'var(--fg)',
      border: '1px solid var(--border-strong)',
      zIndex: 200, display: 'flex', flexDirection: 'column',
      boxShadow: 'var(--elev-2)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '12px 16px',
        borderBottom: '1px solid var(--border-strong)', gap: 12,
      }}>
        <span className="t-mark" style={{ fontSize: 13 }}>Motion</span>
        <span style={{ color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>/</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>
          operator preferences
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ background: 'transparent', border: 0, color: 'var(--fg-muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 14 }}
        >
          ×
        </button>
      </div>

      <div style={{
        padding: '8px 16px 12px', borderBottom: '1px solid var(--border)',
        fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.5,
      }}>
        Tune how STOCK ROYALE animates incoming events. Saved per-browser.
      </div>

      <SectionLabel>Master switches</SectionLabel>
      <SettingRow label="Decrypt text">
        <Toggle value={settings.enableDecrypt} onChange={v => set('enableDecrypt', v)} />
      </SettingRow>
      <SettingRow label="Digit roll">
        <Toggle value={settings.enableDigitRoll} onChange={v => set('enableDigitRoll', v)} />
      </SettingRow>
      <SettingRow label="Tick flash">
        <Toggle value={settings.enableTickFlash} onChange={v => set('enableTickFlash', v)} />
      </SettingRow>
      <SettingRow label="Reorder (FLIP)">
        <Toggle value={settings.enableFlip} onChange={v => set('enableFlip', v)} />
      </SettingRow>

      <SectionLabel>Decryption</SectionLabel>
      <SettingRow label="Total duration">
        <NumSlider value={settings.scrambleDurMs} min={120} max={2400} step={20} onChange={v => set('scrambleDurMs', v)} />
      </SettingRow>
      <SettingRow label="Per-char stagger">
        <NumSlider value={settings.scrambleStaggerMs} min={0} max={80} step={1} onChange={v => set('scrambleStaggerMs', v)} />
      </SettingRow>
      <SettingRow label="Repaint tick">
        <NumSlider value={settings.scrambleTickMs} min={8} max={120} step={2} onChange={v => set('scrambleTickMs', v)} />
      </SettingRow>
      <SettingRow label="Charset" hint="characters used during scramble">
        <input
          type="text"
          value={settings.scrambleCharset}
          onChange={e => set('scrambleCharset', e.target.value)}
          style={{
            width: 160, background: 'var(--bg-elevated)',
            border: '1px solid var(--border)', color: 'var(--fg)',
            padding: '4px 6px', fontFamily: 'var(--font-mono)', fontSize: 11, borderRadius: 0,
          }}
        />
      </SettingRow>

      <SectionLabel>Numbers</SectionLabel>
      <SettingRow label="Digit roll duration">
        <NumSlider value={settings.digitRollDurMs} min={80} max={1200} step={20} onChange={v => set('digitRollDurMs', v)} />
      </SettingRow>
      <SettingRow label="Tick flash duration">
        <NumSlider value={settings.flashDurMs} min={60} max={800} step={20} onChange={v => set('flashDurMs', v)} />
      </SettingRow>

      <SectionLabel>Rows</SectionLabel>
      <SettingRow label="Hairline grow">
        <NumSlider value={settings.hairlineGrowDurMs} min={80} max={800} step={20} onChange={v => set('hairlineGrowDurMs', v)} />
      </SettingRow>
      <SettingRow label="Content rise">
        <NumSlider value={settings.contentRiseDurMs} min={80} max={800} step={20} onChange={v => set('contentRiseDurMs', v)} />
      </SettingRow>
      <SettingRow label="FLIP reorder">
        <NumSlider value={settings.flipDurMs} min={120} max={1200} step={20} onChange={v => set('flipDurMs', v)} />
      </SettingRow>

      <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr', borderTop: '1px solid var(--border)' }}>
        <button
          onClick={reset}
          style={{ ...demoBtn, background: 'var(--fg)', color: 'var(--bg)', borderColor: 'var(--fg)' }}
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

export function AnimGearButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Animation settings"
      title="Motion settings"
      style={{
        position: 'fixed', top: 52, right: 16, zIndex: 199,
        width: 32, height: 32,
        background: open ? 'var(--fg)' : 'var(--bg-elevated)',
        color: open ? 'var(--bg)' : 'var(--fg-muted)',
        border: '1px solid var(--border-strong)', borderRadius: 0,
        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out)',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
  );
}
