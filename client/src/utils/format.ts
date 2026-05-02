export const fmt = (v: number) =>
  '§ ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtShort = (v: number) =>
  v >= 1_000_000 ? (v / 1_000_000).toFixed(2) + 'M'
  : v >= 1_000   ? (v / 1_000).toFixed(1) + 'K'
  : String(v);

export const STARTING_CAPITAL = 100_000;
