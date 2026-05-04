import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAdminLogs, getAdminOrders, getBotStatus, type AdminLog, type BotStatus } from '../api/client';
import { fmt } from '../utils/format';
import { Decrypt, FlashNew, useNewIds } from '../components/WsAnimations';

function AdminLogEntry({ log, expanded, onToggle }: { log: AdminLog; expanded: boolean; onToggle: () => void }) {
  const isThought = log.actionType === 'assistant_message';
  const hasError = (log.result as { error?: string })?.error;
  const isSuccess = (log.result as { success?: boolean })?.success;

  const content = isThought ? (log.result as { content?: string })?.content ?? '' : null;
  const lines = content?.split('\n') ?? [];
  const shouldTruncate = lines.length > 4;
  const displayContent = expanded || !shouldTruncate ? content : lines.slice(0, 4).join('\n');

  const hasDetails = log.actionDetails && Object.keys(log.actionDetails).length > 0;
  const hasResult = log.result && Object.keys(log.result).length > 0 && !isThought;
  const canExpand = isThought ? shouldTruncate : (hasDetails || hasResult || !!hasError);

  return (
    <div
      onClick={canExpand ? onToggle : undefined}
      style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        cursor: canExpand ? 'pointer' : 'default',
        background: isThought ? 'var(--bg-elevated)' : 'transparent',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: (isThought && displayContent) || (!isThought && expanded) ? 8 : 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 500,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: hasError ? 'var(--state-loss)' : isSuccess === false ? 'var(--state-loss)' : isThought ? 'var(--fg-muted)' : 'var(--fg)',
          }}>
            <Decrypt text={isThought ? 'AI Reasoning' : log.actionType} trigger={log.logId} />
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)', letterSpacing: '0.04em' }}>
            {log.username}
          </span>
          {!isThought && isSuccess === true && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>◼ ok</span>
          )}
          {canExpand && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)' }}>
              {expanded ? '▲ collapse' : '▼ expand'}
            </span>
          )}
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)', flexShrink: 0, marginLeft: 8 }}>
          {new Date(log.timestamp).toLocaleString()}
        </span>
      </div>

      {/* Thought content */}
      {isThought && displayContent && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>
          <Decrypt text={displayContent} trigger={`${log.logId}-${expanded}`} style={{ whiteSpace: 'pre-wrap' }} />
          {!expanded && shouldTruncate && <span style={{ color: 'var(--fg-subtle)' }}>...</span>}
        </p>
      )}

      {/* Non-thought expanded details */}
      {!isThought && expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {hasDetails && (
            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {JSON.stringify(log.actionDetails, null, 2)}
            </pre>
          )}
          {hasResult && (
            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {JSON.stringify(log.result, null, 2)}
            </pre>
          )}
          {hasError && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--state-loss)' }}>
              ERR / {(log.result as { error: string }).error}
            </span>
          )}
        </div>
      )}

      {/* Non-thought collapsed summary */}
      {!isThought && !expanded && (hasDetails || hasError) && (
        <div style={{ marginTop: 2 }}>
          {hasDetails && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)', wordBreak: 'break-all' }}>
              {JSON.stringify(log.actionDetails)}
            </span>
          )}
          {hasError && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--state-loss)', display: 'block' }}>
              ERR / {(log.result as { error: string }).error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function Admin() {
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());

  const toggleLog = (id: number) =>
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const { data: logs = [], isLoading: logsLoading } = useQuery<AdminLog[]>({
    queryKey: ['adminLogs'],
    queryFn: () => getAdminLogs(100),
    staleTime: Infinity,
  });

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['adminOrders'],
    queryFn: getAdminOrders,
  });

  const { data: botStatus } = useQuery<BotStatus>({
    queryKey: ['botStatus'],
    queryFn: getBotStatus,
    staleTime: Infinity,
  });

  const bids = orders?.bids ?? [];
  const asks = orders?.asks ?? [];

  const newBidIds = useNewIds(bids.map(b => b.bidId));
  const newAskIds = useNewIds(asks.map(a => a.askId));

  return (
    <div className="sr-page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sub-header */}
      <div className="sr-subheader" style={{
        display: 'flex', alignItems: 'center', padding: '10px 16px',
        borderBottom: '1px solid var(--border)', gap: 16, flexShrink: 0,
      }}>
        <span className="t-mark" style={{ fontSize: 14 }}>Admin</span>
        <span style={{ color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>/</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)' }}>Control Surface</span>
        <span className="sr-spacer" style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)' }}>
          {bids.length}B · {asks.length}A open
        </span>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 500,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          padding: '3px 8px', border: '1px solid',
          background: botStatus?.loopRunning ? 'var(--fg)' : 'transparent',
          color: botStatus?.loopRunning ? 'var(--bg)' : 'var(--fg-muted)',
          borderColor: botStatus?.loopRunning ? 'var(--fg)' : 'var(--border-strong)',
        }}>
          {botStatus?.loopRunning ? 'Loop running' : 'Loop stopped'}
        </span>
      </div>

      <div className="sr-content-row" style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left: open orders + activity log */}
        <div className="sr-scroll-jail" style={{ flex: 1, overflow: 'auto' }}>

          {/* Open orders */}
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
            <span className="t-label">Open Orders / {bids.length + asks.length}</span>
          </div>

          {ordersLoading ? (
            <div style={{ padding: 16, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>Loading...</div>
          ) : bids.length === 0 && asks.length === 0 ? (
            <div style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)', borderBottom: '1px solid var(--border)' }}>
              ∅ No open orders.
            </div>
          ) : (
            <div className="sr-admin-orders" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
              {/* Bids */}
              <div style={{ borderRight: '1px solid var(--border)' }}>
                <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)' }}>
                  <span className="t-label">Bids / {bids.length}</span>
                </div>
                {bids.length === 0 ? (
                  <div style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)' }}>∅ None</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                    <thead>
                      <tr>
                        {['Operator', 'Entity', 'Shares', 'Price', 'Total'].map((h, i) => (
                          <th key={h} style={{
                            padding: '6px 10px', textAlign: i < 2 ? 'left' : 'right',
                            borderBottom: '1px solid var(--border)',
                            fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 500,
                            letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-muted)',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bids.map(b => {
                        const isNew = newBidIds.has(b.bidId);
                        return (
                          <tr key={b.bidId}>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', color: 'var(--fg)' }}>{isNew ? <FlashNew>{b.username}</FlashNew> : b.username}</td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>{isNew ? <FlashNew>{b.ticker}</FlashNew> : b.ticker}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>{isNew ? <FlashNew>{b.shares}</FlashNew> : b.shares}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid var(--border)', color: 'var(--fg-muted)' }}>{isNew ? <FlashNew>{fmt(b.pricePerShare)}</FlashNew> : fmt(b.pricePerShare)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>{isNew ? <FlashNew>{fmt(b.totalCost)}</FlashNew> : fmt(b.totalCost)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Asks */}
              <div>
                <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)' }}>
                  <span className="t-label">Asks / {asks.length}</span>
                </div>
                {asks.length === 0 ? (
                  <div style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)' }}>∅ None</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                    <thead>
                      <tr>
                        {['Operator', 'Entity', 'Shares', 'Price', 'Total'].map((h, i) => (
                          <th key={h} style={{
                            padding: '6px 10px', textAlign: i < 2 ? 'left' : 'right',
                            borderBottom: '1px solid var(--border)',
                            fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 500,
                            letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-muted)',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {asks.map(a => {
                        const isNew = newAskIds.has(a.askId);
                        return (
                          <tr key={a.askId}>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', color: 'var(--fg)' }}>{isNew ? <FlashNew>{a.username}</FlashNew> : a.username}</td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>{isNew ? <FlashNew>{a.ticker}</FlashNew> : a.ticker}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>{isNew ? <FlashNew>{a.shares}</FlashNew> : a.shares}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid var(--border)', color: 'var(--fg-muted)' }}>{isNew ? <FlashNew>{fmt(a.pricePerShare)}</FlashNew> : fmt(a.pricePerShare)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>{isNew ? <FlashNew>{fmt(a.totalValue)}</FlashNew> : fmt(a.totalValue)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Activity log header */}
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
            <span className="t-label">Activity Log / All Bots / {logs.length}</span>
          </div>

          {logsLoading ? (
            <div style={{ padding: 16, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>Loading...</div>
          ) : logs.length === 0 ? (
            <div style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)' }}>
              ∅ No activity yet.
            </div>
          ) : (
            logs.map(log => (
              <AdminLogEntry
                key={log.logId}
                log={log}
                expanded={expandedLogs.has(log.logId)}
                onToggle={() => toggleLog(log.logId)}
              />
            ))
          )}
        </div>

        {/* Right panel: bot queue */}
        <div className="sr-panel-right sr-admin-queue" style={{
          width: 300, flexShrink: 0,
          borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Currently executing */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <span className="t-label">Executing Now</span>
          </div>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {botStatus?.currentBot ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 6, height: 6, background: 'var(--fg)',
                  animation: 'sr-pulse 1.6s ease-in-out infinite', flexShrink: 0,
                }} />
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {botStatus.currentBot.username}
                </span>
              </div>
            ) : (
              <span style={{ color: 'var(--fg-subtle)', fontSize: 11 }}>∅ Idle</span>
            )}
          </div>

          {/* Queue */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <span className="t-label">Queue / {botStatus?.queue.length ?? 0}</span>
          </div>
          {!botStatus?.queue.length ? (
            <div style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)', borderBottom: '1px solid var(--border)' }}>
              ∅ Empty
            </div>
          ) : (
            botStatus.queue.map((bot, i) => (
              <div key={bot.userId} style={{
                padding: '8px 14px', borderBottom: '1px solid var(--border)',
                fontFamily: 'var(--font-mono)', fontSize: 11,
                display: 'flex', gap: 10, alignItems: 'baseline',
              }}>
                <span style={{ color: 'var(--fg-subtle)', minWidth: 20 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {bot.username}
                </span>
              </div>
            ))
          )}

          {/* Timing info */}
          {botStatus && (
            <>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', marginTop: 'auto' }}>
                <span className="t-label">Cycle Info</span>
              </div>
              <div style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--fg-subtle)' }}>Interval</span>
                  <span>{(botStatus.executionInterval / 1000).toFixed(0)}s</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--fg-subtle)' }}>Active bots</span>
                  <span>{botStatus.activeBotsCount}</span>
                </div>
                {botStatus.lastCycleStart && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--fg-subtle)' }}>Last start</span>
                    <span style={{ color: 'var(--fg-muted)' }}>{new Date(botStatus.lastCycleStart).toLocaleTimeString()}</span>
                  </div>
                )}
                {botStatus.lastCycleEnd && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--fg-subtle)' }}>Last end</span>
                    <span style={{ color: 'var(--fg-muted)' }}>{new Date(botStatus.lastCycleEnd).toLocaleTimeString()}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
