/**
 * Demo mode mock — intercepts all API calls and returns snapshot data.
 * Only bundled when VITE_DEMO=true; tree-shaken away in production builds.
 */
import type {
  User, Company, Portfolio, LeaderboardEntry, OrderBook, Transaction, Post,
} from '../types';
import type { BotActivityLog, BotStatus, AdminLog, AdminOrders } from './client';
import demoDataRaw from './demo-data.json';

export const DEMO = import.meta.env.VITE_DEMO === 'true';

// ── Typed snapshot ────────────────────────────────────────────────────────────

const data = demoDataRaw as {
  _meta: { snapshotAt: string; note: string };
  companies: Company[];
  leaderboard: LeaderboardEntry[];
  orderBook: OrderBook;
  adminOrders: AdminOrders;
  transactions: Transaction[];
  posts: Post[];
  portfoliosByUsername: Record<string, Portfolio & { id: number; createdAt: string }>;
  portfolioHistoryByUsername: Record<string, { timestamp: string; value: number }[]>;
  adminLogs: AdminLog[];
  botLogs: BotActivityLog[];
  botStatus: BotStatus;
};

// The demo user — auto-authenticated as admin, no real account needed
export const DEMO_USER: User = {
  id: 1,
  username: 'demo',
  isAdmin: true,
  cashBalance: 100000,
  reservedCash: 0,
  availableCash: 100000,
  holdings: [],
  createdAt: data._meta.snapshotAt,
};

// ── Mock router ───────────────────────────────────────────────────────────────

const companiesByTicker = Object.fromEntries(data.companies.map(c => [c.ticker, c]));

export async function demoFetch<T>(url: string, options?: RequestInit): Promise<T> {
  // Tiny simulated latency so the UI feels natural
  await new Promise(r => setTimeout(r, 30));

  const method = (options?.method ?? 'GET').toUpperCase();
  // Strip protocol + host + /api prefix
  const path = url.replace(/^.*\/api/, '');

  // ── Mutations: return no-op successes so the UI doesn't error ──────────────
  if (method !== 'GET') {
    return handleMutation<T>(path, options);
  }

  // ── GET routing ────────────────────────────────────────────────────────────

  // Companies
  if (path === '/companies') return data.companies as T;
  const companyMatch = path.match(/^\/companies\/([^/]+)$/);
  if (companyMatch) {
    const c = companiesByTicker[companyMatch[1].toUpperCase()];
    if (!c) throw new Error('Company not found');
    return c as T;
  }

  // Users / leaderboard
  if (path === '/users') return data.leaderboard as T;
  const userByIdMatch = path.match(/^\/users\/(\d+)$/);
  if (userByIdMatch) return DEMO_USER as T;
  const userPortfolioMatch = path.match(/^\/users\/(\d+)\/portfolio$/);
  if (userPortfolioMatch) return { ...DEMO_USER, stockValue: 0, totalValue: 100000, holdings: [] } as T;

  // Portfolios by username
  const portfolioByUsernameMatch = path.match(/^\/users\/by-username\/([^/]+)\/portfolio$/);
  if (portfolioByUsernameMatch) {
    const username = decodeURIComponent(portfolioByUsernameMatch[1]);
    return (data.portfoliosByUsername[username] ?? { username, cashBalance: 0, stockValue: 0, totalValue: 0, holdings: [], reservedCash: 0, availableCash: 0 }) as T;
  }
  const historyByUsernameMatch = path.match(/^\/users\/by-username\/([^/]+)\/portfolio-history$/);
  if (historyByUsernameMatch) {
    const username = decodeURIComponent(historyByUsernameMatch[1]);
    return (data.portfolioHistoryByUsername[username] ?? []) as T;
  }

  // Trading
  if (path.startsWith('/trading/orderbook')) return data.orderBook as T;
  if (path.startsWith('/trading/transactions')) return data.transactions as T;

  // Posts
  if (path.startsWith('/posts')) return data.posts as T;

  // Bot
  if (path === '/bot/prompt') {
    return { promptId: null, promptText: '', perspective: null, isActive: false, version: 0 } as T;
  }
  if (path.startsWith('/bot/logs')) return data.botLogs as T;
  if (path === '/bot/tools') return [] as T;
  if (path === '/bot/admin/status') return data.botStatus as T;

  // Admin
  if (path.startsWith('/admin/logs')) return data.adminLogs as T;
  if (path.startsWith('/admin/orders')) return data.adminOrders as T;

  console.warn('[demo] Unhandled GET', path);
  return [] as T;
}

function handleMutation<T>(path: string, options?: RequestInit): T {
  // Login / register — return the demo user so the auth flow works
  if (path === '/users/login' || path === '/users/register') {
    return { ...DEMO_USER, token: 'demo-token' } as T;
  }
  // Bot prompt save
  if (path === '/bot/prompt') return { success: true, promptId: 1, version: 1 } as T;
  // Bot toggle
  if (path === '/bot/toggle') return { success: true, isActive: false } as T;
  // Posts — return a placeholder post so the UI doesn't crash
  if (path === '/posts') {
    return {
      postId: Date.now(),
      username: DEMO_USER.username,
      content: (JSON.parse(options?.body as string ?? '{}') as { content?: string }).content ?? '',
      companyMentioned: null,
      createdAt: new Date().toISOString(),
      isEdited: false,
    } as T;
  }
  // Everything else (bids, asks, cancels, fulfills, splits…)
  return { success: true } as T;
}
