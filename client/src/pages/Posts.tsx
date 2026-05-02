import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPosts, createPost, getCompanies } from '../api/client';
import { useCurrentUser } from '../hooks/useCurrentUser';
import type { Post } from '../types';

export function Posts() {
  const { userId, user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [mentionedTicker, setMentionedTicker] = useState('');
  const [filterTicker, setFilterTicker] = useState('');
  const [error, setError] = useState('');

  const { data: posts = [], isLoading } = useQuery<Post[]>({
    queryKey: ['posts', filterTicker],
    queryFn: () => getPosts(filterTicker || undefined),
    refetchInterval: 10000,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: getCompanies,
  });

  const createMutation = useMutation({
    mutationFn: () => createPost(content, mentionedTicker || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      setContent('');
      setMentionedTicker('');
      setError('');
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) { setError('Authentication required.'); return; }
    if (!content.trim()) { setError('Content required.'); return; }
    createMutation.mutate();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sub-header */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '10px 16px',
        borderBottom: '1px solid var(--border)', gap: 16, flexShrink: 0,
      }}>
        <span className="t-mark" style={{ fontSize: 14 }}>Feed</span>
        <span style={{ color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>/</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)' }}>
          {isLoading ? '...' : `${posts.length} transmissions`}
        </span>
        <span style={{ flex: 1 }} />
        {/* Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="t-label">Filter</span>
          <select
            value={filterTicker}
            onChange={e => setFilterTicker(e.target.value)}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 11,
              background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
              color: filterTicker ? 'var(--fg)' : 'var(--fg-muted)',
              padding: '4px 8px', borderRadius: 0, outline: 0, cursor: 'pointer',
            }}
          >
            <option value="">All entities</option>
            {companies.map(c => (
              <option key={c.ticker} value={c.ticker}>{c.ticker}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Post list */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {isLoading ? (
            <div style={{ padding: 24, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)' }}>Loading...</div>
          ) : posts.length === 0 ? (
            <div style={{ padding: 24, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-subtle)' }}>
              ∅ No transmissions. Be the first to post.
            </div>
          ) : (
            posts.map(post => <PostCard key={post.postId} post={post} />)
          )}
        </div>

        {/* Compose panel */}
        {userId && (
          <div className="sr-panel-right" style={{
            width: 340, flexShrink: 0,
            borderLeft: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
              <span className="t-label">Compose</span>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="t-label">Operator</label>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>
                  {user?.username}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="t-label">Transmission</label>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  rows={6}
                  placeholder="State your position."
                  style={{
                    fontFamily: 'var(--font-body)', fontSize: 13,
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
                    color: 'var(--fg)', padding: '10px 12px', borderRadius: 0,
                    outline: 0, resize: 'none', width: '100%', lineHeight: 1.5,
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="t-label">Entity mention (optional)</label>
                <select
                  value={mentionedTicker}
                  onChange={e => setMentionedTicker(e.target.value)}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 12,
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
                    color: mentionedTicker ? 'var(--fg)' : 'var(--fg-muted)',
                    padding: '8px 10px', borderRadius: 0, outline: 0, cursor: 'pointer',
                  }}
                >
                  <option value="">None</option>
                  {companies.map(c => (
                    <option key={c.ticker} value={c.ticker}>{c.ticker} — {c.companyName}</option>
                  ))}
                </select>
              </div>

              {error && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--state-loss)' }}>
                  ERR / {error}
                </span>
              )}

              <button
                type="submit"
                disabled={createMutation.isPending}
                style={{
                  fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 12,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  height: 40, padding: '0 16px', borderRadius: 0,
                  background: 'var(--fg)', color: 'var(--bg)',
                  border: '1px solid var(--fg)',
                  cursor: createMutation.isPending ? 'not-allowed' : 'pointer',
                  opacity: createMutation.isPending ? 0.5 : 1,
                }}
              >
                {createMutation.isPending ? 'Transmitting...' : 'Transmit →'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function PostCard({ post }: { post: Post }) {
  return (
    <div style={{
      padding: '14px 16px',
      borderBottom: '1px solid var(--border)',
    }}>
      {/* Meta */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'baseline' }}>
        <Link to={`/users/${post.username}`} style={{
          fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 500,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--fg)', textDecoration: 'none',
        }}>
          {post.username}
        </Link>
        {post.companyMentioned && (
          <>
            <span style={{ color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>re:</span>
            <Link to={`/?entity=${post.companyMentioned}`} style={{
              fontFamily: 'var(--font-mono)', fontSize: 11,
              color: 'var(--fg-muted)', textDecoration: 'none',
              letterSpacing: '0.06em',
            }}>
              {post.companyMentioned}
            </Link>
          </>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)' }}>
          {new Date(post.createdAt).toLocaleString()}
          {post.isEdited && ' · edited'}
        </span>
      </div>

      {/* Body */}
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.55, margin: 0 }}>
        {post.content}
      </p>
    </div>
  );
}
