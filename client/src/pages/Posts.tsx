import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPosts, createPost, getCompanies } from '../api/client';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { UserLink } from '../components/UserLink';
import { Link } from 'react-router-dom';

export function Posts() {
  const { userId } = useCurrentUser();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [mentionedTicker, setMentionedTicker] = useState('');
  const [filterTicker, setFilterTicker] = useState('');
  const [error, setError] = useState('');

  const { data: posts, isLoading } = useQuery({
    queryKey: ['posts', filterTicker],
    queryFn: () => getPosts(filterTicker || undefined),
    refetchInterval: 10000,
  });

  const { data: companies } = useQuery({
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
    if (!userId) {
      setError('Please log in to post');
      return;
    }
    if (!content.trim()) {
      setError('Please enter some content');
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-white">Posts</h1>

      {/* Create Post Form */}
      {userId && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4">Create Post</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={3}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                placeholder="What's happening in the market?"
              />
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex-1">
                <select
                  value={mentionedTicker}
                  onChange={(e) => setMentionedTicker(e.target.value)}
                  className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Mention a company (optional)</option>
                  {companies?.map((c) => (
                    <option key={c.ticker} value={c.ticker}>
                      {c.ticker} - {c.companyName}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-md font-medium disabled:opacity-50"
              >
                {createMutation.isPending ? 'Posting...' : 'Post'}
              </button>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}
          </form>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center space-x-4">
        <label className="text-gray-400">Filter by company:</label>
        <select
          value={filterTicker}
          onChange={(e) => setFilterTicker(e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">All Posts</option>
          {companies?.map((c) => (
            <option key={c.ticker} value={c.ticker}>
              {c.ticker}
            </option>
          ))}
        </select>
      </div>

      {/* Posts List */}
      <div className="space-y-4">
        {isLoading ? (
          <p className="text-gray-400">Loading...</p>
        ) : posts && posts.length > 0 ? (
          posts.map((post) => (
            <div
              key={post.postId}
              className="bg-gray-800 rounded-lg p-6 border border-gray-700"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <UserLink username={post.username} className="font-semibold" />
                  {post.companyMentioned && (
                    <Link
                      to={`/companies/${post.companyMentioned}`}
                      className="ml-2 text-green-400 hover:text-green-300 text-sm"
                    >
                      ${post.companyMentioned}
                    </Link>
                  )}
                  <span className="text-gray-500 text-sm ml-2">
                    {new Date(post.createdAt).toLocaleString()}
                    {post.isEdited && ' (edited)'}
                  </span>
                </div>
              </div>

              <p className="text-gray-200">{post.content}</p>
            </div>
          ))
        ) : (
          <p className="text-gray-400 text-center py-8">
            No posts yet. Be the first to share your market insights!
          </p>
        )}
      </div>
    </div>
  );
}
