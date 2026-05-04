import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getLeaderboard } from '../api/client';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { fmt } from '../utils/format';
import { DigitRoll, TickFlash, useFlip } from '../components/WsAnimations';
import type { LeaderboardEntry } from '../types';

// Module-level component so React never remounts rows on parent re-render,
// which would reset the stored FLIP position in useFlip.
function LeaderRow({ entry, rank, userId }: { entry: LeaderboardEntry; rank: number; userId: number | null }) {
  const ref = useFlip<HTMLTableRowElement>(rank);
  const isMe = entry.id === userId;
  const cell = (right = true): React.CSSProperties => ({
    padding: '10px 12px',
    textAlign: right ? 'right' : 'left',
    borderBottom: '1px solid var(--border)',
    background: isMe ? 'var(--bg-elevated)' : 'transparent',
  });
  return (
    <tr ref={ref} style={{ willChange: 'transform' }}>
      <td style={cell(false)}>
        <span style={{ color: rank < 3 ? 'var(--fg)' : 'var(--fg-subtle)' }}>
          {String(rank + 1).padStart(3, '0')}
          {rank === 0 && <span style={{ marginLeft: 8, color: 'var(--fg-muted)' }}>▲</span>}
        </span>
      </td>
      <td style={cell(false)}>
        <Link to={`/users/${entry.username}`} style={{ color: isMe ? 'var(--fg-strong)' : 'var(--fg)', textDecoration: 'none' }}>
          {entry.username}
        </Link>
        {isMe && <span style={{ marginLeft: 8, color: 'var(--fg-subtle)', fontSize: 10 }}>← you</span>}
      </td>
      <td style={cell()}>
        <TickFlash value={entry.cashBalance}><DigitRoll value={fmt(entry.cashBalance)} /></TickFlash>
      </td>
      <td style={cell()}>
        <TickFlash value={entry.stockValue}><DigitRoll value={fmt(entry.stockValue)} /></TickFlash>
      </td>
      <td style={{ ...cell(), color: 'var(--fg-strong)', fontWeight: 500 }}>
        <TickFlash value={entry.totalValue}><DigitRoll value={fmt(entry.totalValue)} /></TickFlash>
      </td>
    </tr>
  );
}

export function Leaderboard() {
  const { userId } = useCurrentUser();

  const { data: leaderboard = [], isLoading } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: getLeaderboard,
  });

  const cols = ['Rank', 'Handle', 'Cash', 'Portfolio', 'Total'];

  return (
    <div className="sr-page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sub-header */}
      <div className="sr-subheader" style={{
        display: 'flex', alignItems: 'center', padding: '10px 16px',
        borderBottom: '1px solid var(--border)', gap: 16, flexShrink: 0,
      }}>
        <span className="t-mark" style={{ fontSize: 14 }}>Operators</span>
        <span style={{ color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>/</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)' }}>
          {isLoading ? '...' : `${leaderboard.length} registered`}
        </span>
      </div>

      {/* Table */}
      <div className="sr-table-wrap sr-scroll-jail" style={{ flex: 1, overflow: 'auto' }}>
        {isLoading ? (
          <div style={{ padding: 24, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)' }}>
            Loading...
          </div>
        ) : leaderboard.length === 0 ? (
          <div style={{ padding: 24, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-subtle)' }}>
            ∅ No operators registered.
          </div>
        ) : (
          <table style={{
            width: '100%', borderCollapse: 'collapse',
            fontFamily: 'var(--font-mono)', fontSize: 12,
            fontVariantNumeric: 'tabular-nums lining-nums',
          }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1 }}>
              <tr>
                {cols.map((h, i) => (
                  <th key={h} style={{
                    padding: '10px 12px',
                    textAlign: i <= 1 ? 'left' : 'right',
                    borderBottom: '1px solid var(--border)',
                    fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 500,
                    letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-muted)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry, i) => (
                <LeaderRow key={entry.id} entry={entry} rank={i} userId={userId} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
