import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPortfolioByUsername, getTransactions, getPortfolioHistory, getOrderBook } from '../api/client';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { fmt, STARTING_CAPITAL } from '../utils/format';
import type { Transaction } from '../types';

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ padding: 16, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
      <div className="t-label" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 18,
        fontVariantNumeric: 'tabular-nums',
        color: highlight ? 'var(--fg-strong)' : 'var(--fg)',
      }}>{value}</div>
    </div>
  );
}

export function UserProfile() {
  const { username } = useParams<{ username: string }>();
  const { user: currentUser } = useCurrentUser();

  const { data: portfolio, isLoading, error } = useQuery({
    queryKey: ['userProfile', username],
    queryFn: () => getPortfolioByUsername(username!),
    enabled: !!username,
  });

  const { data: transactions = [] } = useQuery<Transaction[]>({
    queryKey: ['transactions', username],
    queryFn: () => getTransactions(undefined, username, 20),
    enabled: !!username,
  });

  const { data: history = [] } = useQuery({
    queryKey: ['portfolioHistory', username],
    queryFn: () => getPortfolioHistory(username!),
    enabled: !!username,
  });

  const { data: orderBook } = useQuery({
    queryKey: ['orderbook', 'userProfile', username],
    queryFn: () => getOrderBook(undefined),
    enabled: !!username,
  });

  const userBids = (orderBook?.bids ?? []).filter(b => b.username === username);
  const userAsks = (orderBook?.asks ?? []).filter(a => a.username === username);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)' }}>
        Loading...
      </div>
    );
  }

  if (error || !portfolio) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)' }}>
          ERR / Operator "{username}" not found.
        </span>
        <Link to="/leaderboard" style={{
          fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 500,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--fg)', textDecoration: 'none',
          border: '1px solid var(--border-strong)', padding: '6px 14px',
        }}>
          → Operators list
        </Link>
      </div>
    );
  }

  const isOwnProfile = currentUser?.username === username;
  const pnl = portfolio.totalValue - STARTING_CAPITAL;
  const pnlPct = ((pnl / STARTING_CAPITAL) * 100).toFixed(2);
  const isGain = pnl >= 0;

  // simple sparkline from history
  const histPoints = history.slice(-20).map(h => h.value);

  return (
    <div className="sr-page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sub-header */}
      <div className="sr-subheader" style={{
        display: 'flex', alignItems: 'center', padding: '10px 16px',
        borderBottom: '1px solid var(--border)', gap: 16, flexShrink: 0,
      }}>
        <span className="t-mark" style={{ fontSize: 14 }}>{portfolio.username}</span>
        {isOwnProfile && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)' }}>← you</span>
        )}
        <span style={{ color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>/</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: isGain ? 'var(--fg)' : 'var(--state-loss)' }}>
          {isGain ? '+' : ''}{pnlPct}% from starting capital
        </span>
        {isOwnProfile && (
          <Link to="/portfolio" style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 500,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--fg-muted)', textDecoration: 'none',
            border: '1px solid var(--border)', padding: '4px 12px',
          }}>
            → My portfolio
          </Link>
        )}
      </div>

      <div className="sr-content-row" style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Main */}
        <div className="sr-scroll-jail" style={{ flex: 1, overflow: 'auto' }}>
          {/* Stats */}
          <div className="sr-stats-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <Stat label="Total value" value={fmt(portfolio.totalValue)} highlight />
            <Stat label="Cash" value={fmt(portfolio.cashBalance)} />
            <Stat label="Available cash" value={fmt(portfolio.availableCash)} />
            <Stat label="Stock exposure" value={fmt(portfolio.stockValue)} />
          </div>

          {/* Mini sparkline */}
          {histPoints.length >= 2 && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div className="t-label" style={{ marginBottom: 8 }}>Portfolio trend</div>
              <MiniSparkline points={histPoints} />
            </div>
          )}

          {/* Holdings */}
          <div>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
              <span className="t-label">Holdings / {portfolio.holdings.length}</span>
            </div>
            {portfolio.holdings.length === 0 ? (
              <div style={{ padding: 16, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-subtle)' }}>
                ∅ No holdings.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr>
                    {['Entity', 'Name', 'Shares', 'Ownership', 'VWAP', 'Value'].map((h, i) => (
                      <th key={h} style={{
                        padding: '8px 12px', textAlign: i <= 1 ? 'left' : 'right',
                        borderBottom: '1px solid var(--border)',
                        fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 500,
                        letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-muted)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {portfolio.holdings.map(h => (
                    <tr key={h.ticker}>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                        <Link to={`/?entity=${h.ticker}`} style={{ color: 'var(--fg)', textDecoration: 'none' }}>{h.ticker}</Link>
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--fg-muted)' }}>{h.companyName}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>
                        {h.sharesOwned}
                        {h.reservedShares > 0 && <span style={{ color: 'var(--fg-subtle)', marginLeft: 6 }}>({h.reservedShares} rsv)</span>}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid var(--border)', color: 'var(--fg-muted)' }}>
                        {h.totalSharesIssued ? ((h.sharesOwned / h.totalSharesIssued) * 100).toFixed(2) + '%' : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid var(--border)', color: 'var(--fg-muted)' }}>
                        {h.currentPrice != null ? fmt(h.currentPrice) : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>
                        {h.positionValue != null ? fmt(h.positionValue) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Open Orders */}
          <div style={{ borderTop: '1px solid var(--border)' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
              <span className="t-label">Open orders / {userBids.length + userAsks.length}</span>
            </div>
            {userBids.length === 0 && userAsks.length === 0 ? (
              <div style={{ padding: 16, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-subtle)' }}>
                ∅ No open orders.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr>
                    {['Type', 'Entity', 'Shares', 'Price', 'Total', 'Placed'].map((h, i) => (
                      <th key={h} style={{
                        padding: '8px 12px', textAlign: i <= 1 ? 'left' : 'right',
                        borderBottom: '1px solid var(--border)',
                        fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 500,
                        letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-muted)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {userBids.map(b => (
                    <tr key={b.bidId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg)' }}>▲ Bid</td>
                      <td style={{ padding: '8px 12px' }}>
                        <Link to={`/?entity=${b.ticker}`} style={{ color: 'var(--fg)', textDecoration: 'none' }}>{b.ticker}</Link>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--fg-muted)' }}>{b.shares}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--fg-muted)' }}>{fmt(b.pricePerShare)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmt(b.totalCost)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--fg-subtle)' }}>{new Date(b.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                  {userAsks.map(a => (
                    <tr key={a.askId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--state-loss)' }}>▼ Ask</td>
                      <td style={{ padding: '8px 12px' }}>
                        <Link to={`/?entity=${a.ticker}`} style={{ color: 'var(--fg)', textDecoration: 'none' }}>{a.ticker}</Link>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--fg-muted)' }}>{a.shares}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--fg-muted)' }}>{fmt(a.pricePerShare)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--fg-subtle)' }}>—</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--fg-subtle)' }}>{new Date(a.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Transaction log sidebar */}
        <div className="sr-panel-right" style={{ width: 360, flexShrink: 0, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <span className="t-label">Transaction log / {transactions.length}</span>
          </div>
          <div className="sr-scroll-jail" style={{ flex: 1, overflow: 'auto' }}>
            {transactions.length === 0 ? (
              <div style={{ padding: 16, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-subtle)' }}>∅ No transactions.</div>
            ) : (
              transactions.map(tx => (
                <TxRow key={tx.transactionId} tx={tx} username={username!} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TxRow({ tx, username }: { tx: Transaction; username: string }) {
  const isBuy = tx.buyer === username;
  const counterparty = isBuy ? tx.seller : tx.buyer;
  const total = tx.totalAmount ?? Number(tx.shares) * tx.pricePerShare;

  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 500,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: isBuy ? 'var(--fg)' : 'var(--state-loss)',
        }}>
          {isBuy ? '▲ Acquire' : '▼ Liquidate'}
        </span>
        <span style={{ color: 'var(--fg-subtle)' }}>{new Date(tx.timestamp).toLocaleString()}</span>
      </div>
      <div style={{ display: 'flex', gap: 16, color: 'var(--fg-muted)' }}>
        {tx.ticker && (
          <Link to={`/?entity=${tx.ticker}`} style={{ color: 'var(--fg)', textDecoration: 'none' }}>{tx.ticker}</Link>
        )}
        <span>{tx.shares} shr @ § {tx.pricePerShare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--fg)' }}>
          § {total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      <div style={{ color: 'var(--fg-subtle)', marginTop: 2 }}>
        ↔ {counterparty}
      </div>
    </div>
  );
}

function MiniSparkline({ points }: { points: number[] }) {
  const w = 400, h = 40;
  const min = Math.min(...points), max = Math.max(...points);
  const dx = w / (points.length - 1);
  const path = points.map((p, i) =>
    (i === 0 ? 'M' : 'L') + (i * dx).toFixed(1) + ',' + (h - ((p - min) / (max - min || 1)) * h).toFixed(1)
  ).join(' ');
  const isLoss = points[points.length - 1] < points[0];
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', height: 40 }}>
      <path d={path} fill="none" stroke={isLoss ? 'var(--state-loss)' : 'var(--fg)'} strokeWidth={1.25} />
    </svg>
  );
}
