import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPortfolio,
  getOrderBook,
  getCompanies,
  getTransactions,
  placeBid,
  placeAsk,
  fulfillBid,
  fulfillAsk,
  cancelBid,
  cancelAsk,
  foundCompany,
} from '../api/client';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { fmt, fmtShort } from '../utils/format';
import { TBtn } from '../components/TBtn';
import type { Company, Transaction } from '../types';

// ── Sparkline ──────────────────────────────────────────────────

function Sparkline({ transactions }: { transactions: Transaction[] }) {
  const points = transactions.map(t => t.pricePerShare).reverse();
  if (points.length < 2) {
    return (
      <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)' }}>∅ no trades yet</span>
      </div>
    );
  }
  const w = 320, h = 56;
  const min = Math.min(...points), max = Math.max(...points);
  const dx = w / (points.length - 1);
  const path = points
    .map((p, i) => (i === 0 ? 'M' : 'L') + (i * dx).toFixed(1) + ',' + (h - ((p - min) / (max - min || 1)) * h).toFixed(1))
    .join(' ');
  const first = points[0], last = points[points.length - 1];
  const isLoss = last < first;

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', height: 56 }}>
      {[14, 28, 42].map(y => (
        <line key={y} x1={0} x2={w} y1={y} y2={y}
          stroke="var(--border)" strokeWidth={1} strokeDasharray="2 4" />
      ))}
      <path d={path} fill="none"
        stroke={isLoss ? 'var(--state-loss)' : 'var(--fg)'}
        strokeWidth={1.25} />
    </svg>
  );
}

// ── Stat cell ──────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 12, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
      <div className="t-label" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

// ── Found Entity Modal ─────────────────────────────────────────

function FoundModal({ onClose }: { onClose: () => void }) {
  const { userId } = useCurrentUser();
  const queryClient = useQueryClient();
  const [ticker, setTicker] = useState('');
  const [name, setName] = useState('');
  const [investment, setInvestment] = useState('');
  const [shares, setShares] = useState('');
  const [error, setError] = useState('');

  const foundMutation = useMutation({
    mutationFn: () => foundCompany(ticker.toUpperCase(), name, parseFloat(investment), parseInt(shares)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio', userId] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const pricePerShare = investment && shares ? parseFloat(investment) / parseInt(shares) : 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgb(var(--bg-rgb) / 0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 480, background: 'var(--bg)',
        border: '1px solid var(--border-strong)',
        boxShadow: 'var(--elev-2)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span className="t-mark" style={{ fontSize: 13 }}>Found entity</span>
          <button onClick={onClose} style={{ background: 0, border: 0, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
        {/* Body */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Ticker symbol" value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="e.g. ACME" />
          <Field label="Entity name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Acme Corporation" />
          <Field label="Capital investment (§)" value={investment} onChange={e => setInvestment(e.target.value)} placeholder="Amount" type="number" />
          <Field label="Shares to issue" value={shares} onChange={e => setShares(e.target.value)} placeholder="Total shares" type="number" />
          {pricePerShare > 0 && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)', padding: '8px 12px', background: 'var(--bg-sunken)', border: '1px solid var(--border)' }}>
              Initial price per share: <span style={{ color: 'var(--fg)' }}>{fmt(pricePerShare)}</span>
            </div>
          )}
          {error && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--state-loss)' }}>ERR / {error}</span>}
        </div>
        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <TBtn variant="ghost" onClick={onClose}>Cancel</TBtn>
          <TBtn onClick={() => foundMutation.mutate()} disabled={foundMutation.isPending}>
            {foundMutation.isPending ? 'Processing...' : 'Found entity →'}
          </TBtn>
        </div>
      </div>
    </div>
  );
}

// ── Terminal primitives ────────────────────────────────────────

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label className="t-label">{label}</label>
      <input
        type={type} value={value} onChange={onChange} placeholder={placeholder}
        style={{
          fontFamily: 'var(--font-mono)', fontSize: 13,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
          color: 'var(--fg)', padding: '10px 12px', borderRadius: 0,
          outline: 0, width: '100%',
        }}
      />
    </div>
  );
}

// ── Entity Panel ───────────────────────────────────────────────

function EntityPanel({ company, onDeselect }: { company: Company; onDeselect: () => void }) {
  const { userId, user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [orderSide, setOrderSide] = useState<'bid' | 'ask'>('bid');
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [orderError, setOrderError] = useState('');

  const { data: orderBook } = useQuery({
    queryKey: ['orderbook', company.ticker],
    queryFn: () => getOrderBook(company.ticker),
    refetchInterval: 5000,
  });

  const { data: txns = [] } = useQuery<Transaction[]>({
    queryKey: ['transactions', company.ticker],
    queryFn: () => getTransactions(company.ticker, undefined, 20),
    refetchInterval: 15000,
  });

  const { data: portfolio } = useQuery({
    queryKey: ['portfolio', userId],
    queryFn: () => getPortfolio(userId!),
    enabled: userId !== null,
  });

  const myHolding = portfolio?.holdings.find(h => h.ticker === company.ticker);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['orderbook', company.ticker] });
    queryClient.invalidateQueries({ queryKey: ['portfolio', userId] });
    queryClient.invalidateQueries({ queryKey: ['companies'] });
    queryClient.invalidateQueries({ queryKey: ['transactions', company.ticker] });
  };

  const bidMutation = useMutation({
    mutationFn: () => placeBid(company.ticker, parseInt(shares), parseFloat(price)),
    onSuccess: () => { invalidate(); setShares(''); setPrice(''); setOrderError(''); },
    onError: (err: Error) => setOrderError(err.message),
  });

  const askMutation = useMutation({
    mutationFn: () => placeAsk(company.ticker, parseInt(shares), parseFloat(price)),
    onSuccess: () => { invalidate(); setShares(''); setPrice(''); setOrderError(''); },
    onError: (err: Error) => setOrderError(err.message),
  });

  const fulfillBidMutation = useMutation({
    mutationFn: (bidId: number) => fulfillBid(bidId),
    onSuccess: invalidate,
    onError: (err: Error) => setOrderError(err.message),
  });

  const fulfillAskMutation = useMutation({
    mutationFn: (askId: number) => fulfillAsk(askId),
    onSuccess: invalidate,
    onError: (err: Error) => setOrderError(err.message),
  });

  const cancelBidMutation = useMutation({ mutationFn: (id: number) => cancelBid(id), onSuccess: invalidate });
  const cancelAskMutation = useMutation({ mutationFn: (id: number) => cancelAsk(id), onSuccess: invalidate });

  const handleOrder = () => {
    if (!userId) { setOrderError('Not authenticated.'); return; }
    if (!shares || !price) { setOrderError('Shares and price required.'); return; }
    setOrderError('');
    if (orderSide === 'bid') bidMutation.mutate(); else askMutation.mutate();
  };

  const totalShares = parseInt(company.totalSharesIssued);
  const marketCap = company.currentPrice * totalShares;

  const topBids = (orderBook?.bids ?? []).slice(0, 3);
  const topAsks = (orderBook?.asks ?? []).slice(0, 3);

  return (
    <aside className="sr-panel-right" style={{
      width: 380, flexShrink: 0,
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg)',
      overflow: 'auto',
    }}>
      {/* Header */}
      <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="t-mark" style={{ fontSize: 16 }}>{company.ticker}</span>
          <button onClick={onDeselect} style={{ background: 0, border: 0, color: 'var(--fg-subtle)', cursor: 'pointer', fontSize: 12 }}>✕</button>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, marginTop: 12, fontVariantNumeric: 'tabular-nums' }}>
          {fmt(company.currentPrice)}
        </div>
        <div style={{ color: 'var(--fg-muted)', fontSize: 11, marginTop: 4, fontFamily: 'var(--font-mono)' }}>
          {company.companyName} · founded by {company.foundedBy ?? '—'}
        </div>
      </div>

      {/* Sparkline */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <div className="t-label" style={{ marginBottom: 8 }}>Recent price</div>
        <Sparkline transactions={txns} />
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <Stat label="Market cap" value={'§ ' + fmtShort(marketCap)} />
        <Stat label="Shares issued" value={fmtShort(totalShares)} />
        {myHolding ? (
          <>
            <Stat label="My exposure" value={String(myHolding.sharesOwned) + ' shr'} />
            <Stat label="Reserved" value={String(myHolding.reservedShares) + ' shr'} />
          </>
        ) : (
          <Stat label="My exposure" value="∅ none" />
        )}
      </div>

      {/* Order book */}
      {(topBids.length > 0 || topAsks.length > 0) && (
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <div className="t-label" style={{ marginBottom: 12 }}>Open ledger</div>

          {topBids.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div className="t-label" style={{ marginBottom: 6, fontSize: 10 }}>Bids ▲</div>
              {topBids.map(b => (
                <div key={b.bidId} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 0', borderBottom: '1px solid var(--border)',
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                }}>
                  <div>
                    <span style={{ color: 'var(--fg)' }}>{fmt(b.pricePerShare)}</span>
                    <span style={{ color: 'var(--fg-muted)', marginLeft: 8 }}>× {b.shares}</span>
                    <span style={{ color: 'var(--fg-subtle)', marginLeft: 8 }}>@{b.username}</span>
                  </div>
                  {b.username !== user?.username ? (
                    <TBtn variant="ghost" size="sm"
                      onClick={() => fulfillBidMutation.mutate(b.bidId)}
                      disabled={fulfillBidMutation.isPending}>
                      Sell
                    </TBtn>
                  ) : (
                    <TBtn variant="minimal" size="sm"
                      onClick={() => cancelBidMutation.mutate(b.bidId)}
                      disabled={cancelBidMutation.isPending}>
                      Cancel
                    </TBtn>
                  )}
                </div>
              ))}
            </div>
          )}

          {topAsks.length > 0 && (
            <div>
              <div className="t-label" style={{ marginBottom: 6, fontSize: 10 }}>Asks ▼</div>
              {topAsks.map(a => (
                <div key={a.askId} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 0', borderBottom: '1px solid var(--border)',
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                }}>
                  <div>
                    <span style={{ color: 'var(--state-loss)' }}>{fmt(a.pricePerShare)}</span>
                    <span style={{ color: 'var(--fg-muted)', marginLeft: 8 }}>× {a.shares}</span>
                    <span style={{ color: 'var(--fg-subtle)', marginLeft: 8 }}>@{a.username}</span>
                  </div>
                  {a.username !== user?.username ? (
                    <TBtn variant="ghost" size="sm"
                      onClick={() => fulfillAskMutation.mutate(a.askId)}
                      disabled={fulfillAskMutation.isPending}>
                      Buy
                    </TBtn>
                  ) : (
                    <TBtn variant="minimal" size="sm"
                      onClick={() => cancelAskMutation.mutate(a.askId)}
                      disabled={cancelAskMutation.isPending}>
                      Cancel
                    </TBtn>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Place order */}
      <div style={{ padding: 16 }}>
        <div className="t-label" style={{ marginBottom: 12 }}>Place order</div>

        {/* Side toggle */}
        <div style={{ display: 'flex', border: '1px solid var(--border-strong)', marginBottom: 12 }}>
          {(['bid', 'ask'] as const).map((side, i) => (
            <button key={side} onClick={() => setOrderSide(side)} style={{
              flex: 1, padding: '8px 0',
              fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 500,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              background: orderSide === side ? 'var(--fg)' : 'transparent',
              color: orderSide === side ? 'var(--bg)' : 'var(--fg-muted)',
              border: 0, borderRight: i === 0 ? '1px solid var(--border-strong)' : 0,
              cursor: 'pointer',
            }}>{side === 'bid' ? 'Buy (Bid)' : 'Sell (Ask)'}</button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label className="t-label" style={{ display: 'block', marginBottom: 4 }}>Shares</label>
              <input
                type="number" min="1" value={shares} onChange={e => setShares(e.target.value)}
                placeholder="qty"
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 13, width: '100%',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
                  color: 'var(--fg)', padding: '8px 10px', borderRadius: 0, outline: 0,
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="t-label" style={{ display: 'block', marginBottom: 4 }}>Price / shr</label>
              <input
                type="number" min="0.01" step="0.01" value={price} onChange={e => setPrice(e.target.value)}
                placeholder="§ 0.00"
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 13, width: '100%',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
                  color: 'var(--fg)', padding: '8px 10px', borderRadius: 0, outline: 0,
                }}
              />
            </div>
          </div>

          {shares && price && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>
              Total: {fmt(parseInt(shares) * parseFloat(price))}
            </div>
          )}

          {orderError && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--state-loss)' }}>
              ERR / {orderError}
            </span>
          )}

          <TBtn
            onClick={handleOrder}
            disabled={bidMutation.isPending || askMutation.isPending}
            style={{ width: '100%', height: 40, fontSize: 12 }}
          >
            {bidMutation.isPending || askMutation.isPending
              ? 'Routing...'
              : orderSide === 'bid' ? 'Place bid →' : 'Place ask →'}
          </TBtn>
        </div>
      </div>
    </aside>
  );
}

// ── Market Table ───────────────────────────────────────────────

function MarketTable({
  companies,
  selected,
  onSelect,
}: {
  companies: Company[];
  selected: string | null;
  onSelect: (ticker: string) => void;
}) {
  const cols = ['Entity', 'Price', 'Shares', 'Market Cap', 'Founded by'];

  return (
    <div className="sr-table-wrap" style={{ flex: 1, overflow: 'auto' }}>
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
                textAlign: i === 0 ? 'left' : i === cols.length - 1 ? 'left' : 'right',
                borderBottom: '1px solid var(--border)',
                fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 500,
                letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-muted)',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {companies.map(c => {
            const isSel = selected === c.ticker;
            const totalShares = parseInt(c.totalSharesIssued);
            const marketCap = c.currentPrice * totalShares;
            const cell = (right = true): React.CSSProperties => ({
              padding: '10px 12px',
              textAlign: right ? 'right' : 'left',
              borderBottom: '1px solid var(--border)',
            });
            return (
              <tr
                key={c.ticker}
                onClick={() => onSelect(c.ticker)}
                style={{
                  cursor: 'pointer',
                  background: isSel ? 'var(--bg-elevated)' : 'transparent',
                  transition: 'background var(--dur-1) var(--ease-out)',
                }}
              >
                <td style={cell(false)}>
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ width: 6, height: 6, background: 'var(--fg-muted)', flexShrink: 0 }} />
                    <span style={{ color: 'var(--fg)' }}>{c.ticker}</span>
                    <span style={{ color: 'var(--fg-muted)', fontSize: 11 }}>{c.companyName}</span>
                  </span>
                </td>
                <td style={cell()}>{fmt(c.currentPrice)}</td>
                <td style={cell()}>{fmtShort(totalShares)}</td>
                <td style={cell()}>{'§ ' + fmtShort(marketCap)}</td>
                <td style={{ ...cell(false), color: 'var(--fg-muted)' }}>
                  {c.foundedBy ? (
                    <Link to={`/users/${c.foundedBy}`} onClick={e => e.stopPropagation()}
                      style={{ color: 'var(--fg-muted)', textDecoration: 'none' }}>
                      {c.foundedBy}
                    </Link>
                  ) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────

export function Dashboard() {
  const { userId } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = searchParams.get('entity');
  const [showFoundModal, setShowFoundModal] = useState(false);

  const handleSelect = (ticker: string) => setSearchParams({ entity: ticker }, { replace: true });
  const handleDeselect = () => {
    const p = new URLSearchParams(searchParams);
    p.delete('entity');
    setSearchParams(p, { replace: true });
  };

  const { data: companies = [], isLoading } = useQuery<Company[]>({
    queryKey: ['companies'],
    queryFn: getCompanies,
    refetchInterval: 10000,
  });

  const selectedCompany = companies.find(c => c.ticker === selected) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Sub-header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        gap: 16, flexShrink: 0,
      }}>
        <span className="t-mark" style={{ fontSize: 14 }}>Market</span>
        <span style={{ color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>/</span>
        <span style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          {isLoading ? '...' : `${companies.length} entities`}
        </span>
        <span style={{ flex: 1 }} />

        {userId && (
          <button
            onClick={() => setShowFoundModal(true)}
            style={{
              fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 11,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              height: 32, padding: '0 14px', borderRadius: 0,
              background: 'var(--fg)', color: 'var(--bg)',
              border: '1px solid var(--fg)',
              cursor: 'pointer',
            }}
          >
            + Found entity
          </button>
        )}
      </div>

      {/* Main content */}
      <div className="sr-content-row" style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {isLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            Loading market...
          </div>
        ) : companies.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)' }}>∅ no entities in market</span>
            {userId && (
              <button onClick={() => setShowFoundModal(true)} style={{
                fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 12,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                height: 36, padding: '0 16px', borderRadius: 0,
                background: 'var(--fg)', color: 'var(--bg)',
                border: '1px solid var(--fg)', cursor: 'pointer',
              }}>Found first entity →</button>
            )}
          </div>
        ) : (
          <>
            <MarketTable companies={companies} selected={selected} onSelect={handleSelect} />
            {selectedCompany && (
              <EntityPanel company={selectedCompany} onDeselect={handleDeselect} />
            )}
          </>
        )}
      </div>

      {showFoundModal && <FoundModal onClose={() => setShowFoundModal(false)} />}
    </div>
  );
}
