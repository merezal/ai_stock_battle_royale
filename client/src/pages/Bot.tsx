import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { TBtn } from '../components/TBtn';
import { Decrypt } from '../components/WsAnimations';
import {
  getBotPrompt,
  saveBotPrompt,
  toggleBot,
  runBotOnce,
  getBotLogs,
  getBotTools,
  getBotStatus,
  type BotPrompt,
  type BotActivityLog,
  type BotTool,
  type BotStatus,
} from '../api/client';


// ── Mandate Composer Modal ─────────────────────────────────────

function MandateComposer({
  open,
  promptText,
  onTextChange,
  isActive,
  onClose,
  onSave,
  onToggle,
  onRunOnce,
  saving,
  running,
  version,
  lastModified,
  hasChanges,
}: {
  open: boolean;
  promptText: string;
  onTextChange: (v: string) => void;
  isActive: boolean;
  onClose: () => void;
  onSave: () => void;
  onToggle: (v: boolean) => void;
  onRunOnce: () => void;
  saving: boolean;
  running: boolean;
  version?: number;
  lastModified?: string;
  hasChanges: boolean;
}) {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgb(var(--bg-rgb) / 0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 600, background: 'var(--bg)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--elev-2)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Modal header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span className="t-mark" style={{ fontSize: 13 }}>Compose mandate</span>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {version && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>
                v{version}
              </span>
            )}
            <button onClick={onClose} style={{ background: 0, border: 0, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Textarea */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="t-label">Mandate</label>
            <textarea
              value={promptText}
              onChange={e => onTextChange(e.target.value)}
              rows={10}
              placeholder="Acquire TICKER below the 24h median. Hold for 6 hours. Liquidate on a 3% drawdown from peak. Do not exceed 8% of total exposure."
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 13,
                background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
                color: 'var(--fg)', padding: '10px 12px', borderRadius: 0,
                outline: 0, width: '100%', resize: 'vertical', minHeight: 180,
              }}
            />
          </div>

          {/* Info block */}
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)',
            padding: 12, background: 'var(--bg-sunken)', border: '1px solid var(--border)',
          }}>
            ∴ Mandates run as natural-language prompts on the trading agent. Specify entity, conditions, and limits.{' '}
            <span style={{ color: 'var(--fg)' }}>Be explicit.</span>{' '}
            The agent does not infer.
          </div>

          {/* Status row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>
              {hasChanges
                ? <span style={{ color: 'var(--state-warn)' }}>◼ Unsaved changes</span>
                : lastModified
                ? `Last saved ${new Date(lastModified).toLocaleString()}`
                : '∅ Not saved yet'}
            </div>
            {/* Active toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <span className="t-label">Deploy on cycle</span>
              <div
                onClick={() => onToggle(!isActive)}
                style={{
                  width: 36, height: 20, borderRadius: 0,
                  background: isActive ? 'var(--fg)' : 'var(--bg-sunken)',
                  border: '1px solid var(--border-strong)',
                  position: 'relative', cursor: 'pointer',
                  transition: 'background var(--dur-1) var(--ease-out)',
                }}
              >
                <div style={{
                  position: 'absolute', top: 2,
                  left: isActive ? 'calc(100% - 18px)' : 2,
                  width: 14, height: 14,
                  background: isActive ? 'var(--bg)' : 'var(--fg-muted)',
                  transition: 'left var(--dur-2) var(--ease-out)',
                }} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: isActive ? 'var(--fg)' : 'var(--fg-muted)' }}>
                {isActive ? 'Active' : 'Inactive'}
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center',
        }}>
          <TBtn size="lg" variant="ghost" onClick={onRunOnce} disabled={running || !promptText}>
            {running ? 'Running...' : 'Run once'}
          </TBtn>
          <div style={{ display: 'flex', gap: 8 }}>
            <TBtn size="lg" variant="ghost" onClick={onClose}>Cancel</TBtn>
            <TBtn size="lg" onClick={onSave} disabled={!hasChanges || saving}>
              {saving ? 'Saving...' : 'Save mandate →'}
            </TBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Log entry ──────────────────────────────────────────────────

function LogEntry({ log, expanded, onToggle }: { log: BotActivityLog; expanded: boolean; onToggle: () => void }) {
  const isThought = log.actionType === 'assistant_message';
  const content = isThought ? (log.result as { content?: string })?.content ?? '' : null;
  const lines = content?.split('\n') ?? [];
  const shouldTruncate = lines.length > 4;
  const displayContent = expanded || !shouldTruncate ? content : lines.slice(0, 4).join('\n');

  const hasError = (log.result as { error?: string })?.error;
  const isSuccess = (log.result as { success?: boolean })?.success;

  const labelText = isThought ? 'AI reasoning' : log.actionType;

  return (
    <div
      onClick={isThought ? onToggle : undefined}
      style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        cursor: isThought ? 'pointer' : 'default',
        background: isThought ? 'var(--bg-elevated)' : 'transparent',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isThought ? 8 : 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 500,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: isThought ? 'var(--fg-muted)' : hasError ? 'var(--state-loss)' : isSuccess === false ? 'var(--state-loss)' : 'var(--fg)',
          }}>
            <Decrypt text={labelText} trigger={log.logId} />
          </span>
          {!isThought && isSuccess === true && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>◼ ok</span>
          )}
          {isThought && shouldTruncate && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)' }}>
              {expanded ? '▲ collapse' : '▼ expand'}
            </span>
          )}
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)' }}>
          {new Date(log.timestamp).toLocaleString()}
        </span>
      </div>

      {isThought && displayContent && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>
          <Decrypt text={displayContent} trigger={`${log.logId}-${expanded}`} style={{ whiteSpace: 'pre-wrap' }} />
          {!expanded && shouldTruncate && <span style={{ color: 'var(--fg-subtle)' }}>...</span>}
        </p>
      )}

      {!isThought && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
          {log.actionDetails && Object.keys(log.actionDetails).length > 0 && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)', wordBreak: 'break-all' }}>
              {JSON.stringify(log.actionDetails)}
            </span>
          )}
          {hasError && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--state-loss)' }}>
              ERR / {(log.result as { error: string }).error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Bot / Mandates page ────────────────────────────────────────

export function Bot() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [promptText, setPromptText] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());
  const [runResult, setRunResult] = useState<{ success?: boolean; error?: string; toolCallCount?: number } | null>(null);

  const { data: botPrompt, isLoading: promptLoading } = useQuery<BotPrompt>({
    queryKey: ['botPrompt', user?.id],
    queryFn: getBotPrompt,
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (botPrompt && !initialLoaded) {
      setPromptText(botPrompt.promptText);
      setInitialLoaded(true);
    }
  }, [botPrompt, initialLoaded]);

  const { data: tools } = useQuery<BotTool[]>({
    queryKey: ['botTools'],
    queryFn: getBotTools,
  });

  const { data: botStatus } = useQuery<BotStatus>({
    queryKey: ['botStatus'],
    queryFn: getBotStatus,
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery<BotActivityLog[]>({
    queryKey: ['botLogs', user?.id],
    queryFn: () => getBotLogs(40),
    enabled: !!user?.id,
  });

  const saveMutation = useMutation({
    mutationFn: () => saveBotPrompt(promptText),
    onSuccess: () => {
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['botPrompt', user?.id] });
    },
    onError: (err: Error) => setRunResult({ success: false, error: err.message }),
  });

  const toggleMutation = useMutation({
    mutationFn: (isActive: boolean) => toggleBot(isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['botPrompt', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['botStatus'] });
    },
    onError: (err: Error) => setRunResult({ success: false, error: err.message }),
  });

  const runOnceMutation = useMutation({
    mutationFn: runBotOnce,
    onSuccess: (result) => {
      setRunResult(result);
      queryClient.invalidateQueries({ queryKey: ['botLogs', user?.id] });
    },
  });

  const handleTextChange = (v: string) => {
    setPromptText(v);
    setHasChanges(v !== (botPrompt?.promptText ?? ''));
  };

  if (!user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)' }}>
        ∅ Authentication required.
      </div>
    );
  }

  if (promptLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)' }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="sr-page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sub-header */}
      <div className="sr-subheader" style={{
        display: 'flex', alignItems: 'center',
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        gap: 16, flexShrink: 0,
      }}>
        <span className="t-mark" style={{ fontSize: 14 }}>Mandates</span>
        <span style={{ color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>/</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)' }}>
          Agent: <span style={{ color: botPrompt?.isActive ? 'var(--fg)' : 'var(--fg-muted)' }}>
            {botPrompt?.isActive ? '◼ active' : '◻ inactive'}
          </span>
        </span>
        {botStatus?.currentBot && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>
            · executing: <span style={{ color: 'var(--fg)' }}>{botStatus.currentBot.username}</span>
          </span>
        )}
        <span className="sr-spacer" style={{ flex: 1 }} />
        <TBtn size="lg" onClick={() => setComposerOpen(true)}>
          {botPrompt?.promptId ? 'Edit mandate →' : '+ New mandate'}
        </TBtn>
      </div>

      {/* Content */}
      <div className="sr-content-row" style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Main area */}
        <div className="sr-scroll-jail" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
          {/* Current mandate preview */}
          <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
            <div className="t-label" style={{ marginBottom: 12 }}>Current mandate</div>
            {botPrompt?.promptText ? (
              <pre style={{
                fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)',
                background: 'var(--bg-sunken)', border: '1px solid var(--border)',
                padding: 16, margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6,
                maxHeight: 200, overflow: 'auto',
              }}>
                {botPrompt.promptText}
              </pre>
            ) : (
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-subtle)',
                padding: 16, background: 'var(--bg-sunken)', border: '1px solid var(--border)',
              }}>
                ∅ No mandate configured. Deploy an agent to begin.
              </div>
            )}
            {botPrompt?.promptId && (
              <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                <TBtn
                  size="lg"
                  variant={botPrompt.isActive ? 'ghost' : 'primary'}
                  onClick={() => toggleMutation.mutate(!botPrompt.isActive)}
                  disabled={toggleMutation.isPending}
                >
                  {botPrompt.isActive ? '◻ Halt agent' : '◼ Deploy agent'}
                </TBtn>
                <TBtn
                  size="lg"
                  variant="ghost"
                  onClick={() => runOnceMutation.mutate()}
                  disabled={runOnceMutation.isPending || !botPrompt.promptId}
                >
                  {runOnceMutation.isPending ? 'Running...' : 'Run once'}
                </TBtn>
              </div>
            )}
          </div>

          {/* Perspective */}
          <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              <span className="t-label">Perspective</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)' }}>bot-authored · read only</span>
            </div>
            {botPrompt?.perspective ? (
              <div style={{
                background: 'var(--bg-sunken)', border: '1px solid var(--border)',
                padding: '12px 16px', maxHeight: 280, overflow: 'auto',
                fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7,
                color: 'var(--fg-muted)',
              }}>
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p style={{ margin: '0 0 8px' }}>{children}</p>,
                    ul: ({ children }) => <ul style={{ margin: '0 0 8px', paddingLeft: 20 }}>{children}</ul>,
                    ol: ({ children }) => <ol style={{ margin: '0 0 8px', paddingLeft: 20 }}>{children}</ol>,
                    li: ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
                    strong: ({ children }) => <strong style={{ color: 'var(--fg)', fontWeight: 600 }}>{children}</strong>,
                    h1: ({ children }) => <div style={{ color: 'var(--fg)', fontWeight: 600, marginBottom: 6 }}>{children}</div>,
                    h2: ({ children }) => <div style={{ color: 'var(--fg)', fontWeight: 600, marginBottom: 4, fontSize: 11 }}>{children}</div>,
                    h3: ({ children }) => <div style={{ color: 'var(--fg-muted)', fontWeight: 600, marginBottom: 4 }}>{children}</div>,
                    code: ({ children }) => <code style={{ background: 'var(--bg-elevated)', padding: '1px 4px', borderRadius: 2 }}>{children}</code>,
                    hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />,
                  }}
                >
                  {botPrompt.perspective}
                </ReactMarkdown>
              </div>
            ) : (
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-subtle)',
                padding: 16, background: 'var(--bg-sunken)', border: '1px solid var(--border)',
              }}>
                ∅ No perspective yet — the agent will write one after its first turn.
              </div>
            )}
          </div>

          {/* Run result */}
          {runResult && (
            <div style={{
              margin: '0 16px 0', padding: '10px 14px',
              background: 'var(--bg-sunken)', border: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)', fontSize: 12,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ color: runResult.success ? 'var(--fg)' : 'var(--state-loss)' }}>
                {runResult.success ? '◼ Execution complete' : 'ERR / Execution failed'}
                {runResult.toolCallCount !== undefined && ` · ${runResult.toolCallCount} tool calls`}
                {runResult.error && ` · ${runResult.error}`}
              </span>
              <button onClick={() => setRunResult(null)} style={{ background: 0, border: 0, color: 'var(--fg-subtle)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11 }}>Dismiss</button>
            </div>
          )}

          {/* Execution queue */}
          {botStatus && (botStatus.currentBot || botStatus.queue.length > 0) && (
            <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
              <div className="t-label" style={{ marginBottom: 12 }}>Execution queue</div>
              {botStatus.currentBot && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', border: '1px solid var(--border-strong)',
                  fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 4,
                }}>
                  <span style={{ width: 6, height: 6, background: 'var(--fg)', animation: 'sr-pulse 1.6s ease-in-out infinite' }} />
                  <span className="t-label">Executing</span>
                  <span style={{ color: 'var(--fg)' }}>{botStatus.currentBot.username}</span>
                </div>
              )}
              {botStatus.queue.map((bot, i) => (
                <div key={bot.userId} style={{
                  display: 'flex', gap: 8, padding: '6px 12px',
                  borderBottom: '1px solid var(--border)',
                  fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)',
                }}>
                  <span style={{ color: 'var(--fg-subtle)' }}>{String(i + 1).padStart(2, '0')}</span>
                  <span>{bot.username}</span>
                </div>
              ))}
            </div>
          )}

          {/* Available tools */}
          {tools && tools.length > 0 && (
            <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
              <div className="t-label" style={{ marginBottom: 12 }}>Available tools / {tools.length}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {tools.map(tool => (
                  <div key={tool.name} style={{
                    padding: '8px 12px', border: '1px solid var(--border)',
                    background: 'var(--bg-sunken)',
                  }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{tool.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>{tool.description}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Activity log sidebar */}
        <div className="sr-panel-right" style={{
          width: 400, flexShrink: 0, borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <span className="t-label">Activity log</span>
          </div>
          <div className="sr-scroll-jail" style={{ flex: 1, overflow: 'auto' }}>
            {logsLoading ? (
              <div style={{ padding: 16, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)' }}>Loading...</div>
            ) : logs.length === 0 ? (
              <div style={{ padding: 16, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-subtle)' }}>∅ No activity yet. Run your agent.</div>
            ) : (
              logs.map(log => (
                <LogEntry
                  key={log.logId}
                  log={log}
                  expanded={expandedLogs.has(log.logId)}
                  onToggle={() => setExpandedLogs(prev => {
                    const next = new Set(prev);
                    if (next.has(log.logId)) next.delete(log.logId); else next.add(log.logId);
                    return next;
                  })}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Mandate composer modal */}
      <MandateComposer
        open={composerOpen}
        promptText={promptText}
        onTextChange={handleTextChange}
        isActive={botPrompt?.isActive ?? false}
        onClose={() => setComposerOpen(false)}
        onSave={() => saveMutation.mutate()}
        onToggle={(v) => toggleMutation.mutate(v)}
        onRunOnce={() => runOnceMutation.mutate()}
        saving={saveMutation.isPending}
        running={runOnceMutation.isPending}
        version={botPrompt?.version}
        lastModified={botPrompt?.lastModified}
        hasChanges={hasChanges}
      />
    </div>
  );
}
