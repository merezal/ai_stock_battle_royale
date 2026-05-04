import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPortfolio,
  getPortfolioHistory,
  getOrderBook,
  getTransactions,
  cancelBid,
  cancelAsk,
} from '../api/client';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { PortfolioChart } from '../components/PortfolioChart';
import { fmt, STARTING_CAPITAL } from '../utils/format';
import { TBtn } from '../components/TBtn';
import { FlashNew, useNewIds } from '../components/WsAnimations';
import type { Transaction, Bid, Ask } from '../types';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ padding: 16, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
      <div className="t-label" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function Portfolio() {
  const { userId, user } = useCurrentUser();
  const queryClient = useQueryClient();

  const { data: portfolio, isLoading } = useQuery({
    queryKey: ['portfolio', userId],
    queryFn: () => getPortfolio(userId!),
    enabled: userId !== null,
  });

  const { data: history = [] } = useQuery({
    queryKey: ['portfolioHistory', user?.username],
    queryFn: () => getPortfolioHistory(user!.username),
    enabled: !!user?.username,
  });

  const { data: orderBook } = useQuery({
    queryKey: ['orderbook', 'all'],
    queryFn: () => getOrderBook(undefined),
  });

  const { data: transactions = [] } = useQuery<Transaction[]>({
    queryKey: ['transactions', user?.username],
    queryFn: () => getTransactions(undefined, user!.username, 50),
    enabled: !!user?.username,
  });

  const [cancelError, setCancelError] = useState('');

  const cancelBidMutation = useMutation({
    mutationFn: (id: number) => cancelBid(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderbook'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio', userId] });
    },
    onError: (err: Error) => setCancelError(err.message),
  });

  const cancelAskMutation = useMutation({
    mutationFn: (id: number) => cancelAsk(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderbook'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio', userId] });
    },
    onError: (err: Error) => setCancelError(err.message),
  });

  const myBids: Bid[] = (orderBook?.bids ?? []).filter(b => b.username === user?.username);
  const myAsks: Ask[] = (orderBook?.asks ?? []).filter(a => a.username === user?.username);

  const newBidIds = useNewIds(myBids.map(b => b.bidId));
  const newAskIds = useNewIds(myAsks.map(a => a.askId));

  if (!userId || !user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)' }}>
        ∅ Authentication required.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)' }}>
        Loading...
      </div>
    );
  }

  const pnl = (portfolio?.totalValue ?? 0) - STARTING_CAPITAL;
  const pnlPct = ((pnl / STARTING_CAPITAL) * 100).toFixed(2);
  const isGain = pnl >= 0;

  return (
    <div className="sr-page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sub-header */}
      <div className="sr-subheader" style={{
        display: 'flex', alignItems: 'center', padding: '10px 16px',
        borderBottom: '1px solid var(--border)', gap: 16, flexShrink: 0,
      }}>
        <span className="t-mark" style={{ fontSize: 14 }}>Portfolio</span>
        <span style={{ color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>/</span>
        <span className="t-mark" style={{ fontSize: 13 }}>{user.username}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: isGain ? 'var(--fg)' : 'var(--state-loss)' }}>
          {isGain ? '+' : ''}{pnlPct}% from § {STARTING_CAPITAL.toLocaleString()}
        </span>
        <span className="sr-spacer" style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)' }}>
          {myBids.length + myAsks.length} open orders
        </span>
      </div>

      <div className="sr-content-row" style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left: chart + holdings */}
        <div className="sr-scroll-jail" style={{ flex: 1, overflow: 'auto' }}>
          {/* Summary stats */}
          {portfolio && (
            <div className="sr-stats-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <Stat label="Total value" value={fmt(portfolio.totalValue)} />
              <Stat label="Cash" value={fmt(portfolio.cashBalance)} sub={`§ ${portfolio.availableCash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} available`} />
              <Stat label="Stock exposure" value={fmt(portfolio.stockValue)} />
              <Stat label="Holdings" value={String(portfolio.holdings.length)} sub="entities" />
            </div>
          )}

          {/* Chart */}
          <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
            <div className="t-label" style={{ marginBottom: 12 }}>Portfolio history</div>
            <PortfolioChart history={history} />
          </div>

          {/* Holdings table */}
          {portfolio && portfolio.holdings.length > 0 && (
            <div>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                <span className="t-label">Holdings / {portfolio.holdings.length}</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr>
                    {['Entity', 'Company', 'Shares', 'Ownership', 'Reserved', 'VWAP', 'Value'].map((h, i) => (
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
                      <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>{h.sharesOwned}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid var(--border)', color: 'var(--fg-muted)' }}>
                        {h.totalSharesIssued ? ((h.sharesOwned / h.totalSharesIssued) * 100).toFixed(2) + '%' : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid var(--border)', color: 'var(--fg-subtle)' }}>
                        {h.reservedShares > 0 ? h.reservedShares : '—'}
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
            </div>
          )}
        </div>

        {/* Right panel: open orders + transaction log */}
        <div className="sr-panel-right" style={{ width: 360, flexShrink: 0, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          {/* Open orders */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="t-label">Open orders</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)' }}>
                {myBids.length}B · {myAsks.length}A
              </span>
            </div>

            {myBids.length === 0 && myAsks.length === 0 ? (
              <div style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)', borderBottom: '1px solid var(--border)' }}>
                ∅ No open orders.
              </div>
            ) : (
              <>
                {myBids.map(bid => {
                  const isNew = newBidIds.has(bid.bidId);
                  return (
                    <div key={bid.bidId} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 14px', borderBottom: '1px solid var(--border)',
                      fontFamily: 'var(--font-mono)', fontSize: 11,
                    }}>
                      <div>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg)' }}>
                          {isNew ? <FlashNew>▲ Bid</FlashNew> : '▲ Bid'}
                        </span>
                        <span style={{ marginLeft: 8 }}>
                          <Link to={`/?entity=${bid.ticker}`} style={{ color: 'var(--fg)', textDecoration: 'none' }}>
                            {isNew ? <FlashNew>{bid.ticker}</FlashNew> : bid.ticker}
                          </Link>
                        </span>
                        <span style={{ color: 'var(--fg-muted)', marginLeft: 6 }}>
                          {isNew ? <FlashNew>× {bid.shares} @ {fmt(bid.pricePerShare)}</FlashNew> : `× ${bid.shares} @ ${fmt(bid.pricePerShare)}`}
                        </span>
                      </div>
                      <TBtn size="sm" onClick={() => cancelBidMutation.mutate(bid.bidId)} disabled={cancelBidMutation.isPending}>
                        Cancel
                      </TBtn>
                    </div>
                  );
                })}
                {myAsks.map(ask => {
                  const isNew = newAskIds.has(ask.askId);
                  return (
                    <div key={ask.askId} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 14px', borderBottom: '1px solid var(--border)',
                      fontFamily: 'var(--font-mono)', fontSize: 11,
                    }}>
                      <div>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--state-loss)' }}>
                          {isNew ? <FlashNew>▼ Ask</FlashNew> : '▼ Ask'}
                        </span>
                        <span style={{ marginLeft: 8 }}>
                          <Link to={`/?entity=${ask.ticker}`} style={{ color: 'var(--fg)', textDecoration: 'none' }}>
                            {isNew ? <FlashNew>{ask.ticker}</FlashNew> : ask.ticker}
                          </Link>
                        </span>
                        <span style={{ color: 'var(--fg-muted)', marginLeft: 6 }}>
                          {isNew ? <FlashNew>× {ask.shares} @ {fmt(ask.pricePerShare)}</FlashNew> : `× ${ask.shares} @ ${fmt(ask.pricePerShare)}`}
                        </span>
                      </div>
                      <TBtn size="sm" onClick={() => cancelAskMutation.mutate(ask.askId)} disabled={cancelAskMutation.isPending}>
                        Cancel
                      </TBtn>
                    </div>
                  );
                })}
              </>
            )}
            {cancelError && (
              <div style={{ padding: '8px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--state-loss)', borderBottom: '1px solid var(--border)' }}>
                ERR / {cancelError}
              </div>
            )}
          </div>

          {/* Transaction log */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <span className="t-label">Activity log / {transactions.length}</span>
            </div>
            <div className="sr-scroll-jail" style={{ flex: 1, overflow: 'auto' }}>
              {transactions.length === 0 ? (
                <div style={{ padding: 14, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)' }}>
                  ∅ No transactions yet.
                </div>
              ) : (
                transactions.map(tx => (
                  <TxRow key={tx.transactionId} tx={tx} username={user.username} />
                ))
              )}
            </div>
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
    <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 500,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: isBuy ? 'var(--fg)' : 'var(--state-loss)',
          }}>
            {isBuy ? '▲' : '▼'} {isBuy ? 'Acquire' : 'Liquidate'}
          </span>
          {tx.ticker && (
            <Link to={`/?entity=${tx.ticker}`} style={{ color: 'var(--fg-muted)', textDecoration: 'none' }}>{tx.ticker}</Link>
          )}
        </div>
        <span style={{ color: 'var(--fg-subtle)', fontSize: 10 }}>{new Date(tx.timestamp).toLocaleString()}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fg-muted)' }}>
        <span>{tx.shares} shr @ § {tx.pricePerShare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        <span style={{ color: 'var(--fg)' }}>§ {total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      <div style={{ color: 'var(--fg-subtle)', marginTop: 2 }}>↔ {counterparty}</div>
    </div>
  );
}
