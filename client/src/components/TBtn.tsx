type TBtnVariant = 'primary' | 'ghost' | 'minimal';
type TBtnSize = 'sm' | 'md' | 'lg';

const SIZES: Record<TBtnSize, React.CSSProperties> = {
  sm: { height: 24, padding: '0 8px',  fontSize: 10 },
  md: { height: 32, padding: '0 14px', fontSize: 11 },
  lg: { height: 36, padding: '0 16px', fontSize: 11 },
};

const VARIANTS: Record<TBtnVariant, React.CSSProperties> = {
  primary: { background: 'var(--fg)',        color: 'var(--bg)',       borderColor: 'var(--fg)' },
  ghost:   { background: 'transparent',      color: 'var(--fg)',       borderColor: 'var(--border-strong)' },
  minimal: { background: 'transparent',      color: 'var(--fg-muted)', borderColor: 'transparent' },
};

export function TBtn({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: TBtnVariant;
  size?: TBtnSize;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        fontFamily: 'var(--font-display)', fontWeight: 500,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        borderRadius: 0, border: '1px solid',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'opacity var(--dur-1) var(--ease-out)',
        ...SIZES[size], ...VARIANTS[variant], ...style,
      }}
    >
      {children}
    </button>
  );
}
