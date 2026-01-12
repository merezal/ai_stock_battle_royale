import type {
  User,
  Portfolio,
  LeaderboardEntry,
  Company,
  OrderBook,
  Transaction,
  Post,
} from '../types';

const API_BASE = '/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

// Users
export async function registerUser(username: string, email: string): Promise<User> {
  return fetchJSON(`${API_BASE}/users/register`, {
    method: 'POST',
    body: JSON.stringify({ username, email }),
  });
}

export async function getUser(id: number): Promise<User> {
  return fetchJSON(`${API_BASE}/users/${id}`);
}

export async function getPortfolio(id: number): Promise<Portfolio> {
  return fetchJSON(`${API_BASE}/users/${id}/portfolio`);
}

export async function getPortfolioByUsername(username: string): Promise<Portfolio & { id: number; createdAt: string }> {
  return fetchJSON(`${API_BASE}/users/by-username/${encodeURIComponent(username)}/portfolio`);
}

export async function getPortfolioHistory(username: string): Promise<{ timestamp: string; value: number }[]> {
  return fetchJSON(`${API_BASE}/users/by-username/${encodeURIComponent(username)}/portfolio-history`);
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  return fetchJSON(`${API_BASE}/users`);
}

// Companies
export async function foundCompany(
  userId: number,
  tickerSymbol: string,
  companyName: string,
  investmentAmount: number,
  totalShares: number
): Promise<{ success: boolean; company: Company }> {
  return fetchJSON(`${API_BASE}/companies/found`, {
    method: 'POST',
    body: JSON.stringify({ userId, tickerSymbol, companyName, investmentAmount, totalShares }),
  });
}

export async function getCompanies(): Promise<Company[]> {
  return fetchJSON(`${API_BASE}/companies`);
}

export async function getCompany(ticker: string): Promise<Company> {
  return fetchJSON(`${API_BASE}/companies/${ticker}`);
}

export async function splitStock(
  userId: number,
  ticker: string
): Promise<{ success: boolean; message: string; newTotalShares: string; splitMultiplier: number }> {
  return fetchJSON(`${API_BASE}/companies/${ticker}/split`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

// Trading
export async function placeBid(
  userId: number,
  ticker: string,
  shares: number,
  pricePerShare: number
): Promise<{ success: boolean; bidId: number; totalCost: number }> {
  return fetchJSON(`${API_BASE}/trading/bids`, {
    method: 'POST',
    body: JSON.stringify({ userId, ticker, shares, pricePerShare }),
  });
}

export async function placeAsk(
  userId: number,
  ticker: string,
  shares: number,
  pricePerShare: number
): Promise<{ success: boolean; askId: number }> {
  return fetchJSON(`${API_BASE}/trading/asks`, {
    method: 'POST',
    body: JSON.stringify({ userId, ticker, shares, pricePerShare }),
  });
}

export async function fulfillBid(
  bidId: number,
  userId: number
): Promise<{ success: boolean; transactionId: number }> {
  return fetchJSON(`${API_BASE}/trading/bids/${bidId}/fulfill`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function fulfillAsk(
  askId: number,
  userId: number
): Promise<{ success: boolean; transactionId: number }> {
  return fetchJSON(`${API_BASE}/trading/asks/${askId}/fulfill`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function cancelBid(
  bidId: number,
  userId: number
): Promise<{ success: boolean }> {
  return fetchJSON(`${API_BASE}/trading/bids/${bidId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function cancelAsk(
  askId: number,
  userId: number
): Promise<{ success: boolean }> {
  return fetchJSON(`${API_BASE}/trading/asks/${askId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function getOrderBook(ticker?: string): Promise<OrderBook> {
  const url = ticker
    ? `${API_BASE}/trading/orderbook?ticker=${ticker}`
    : `${API_BASE}/trading/orderbook`;
  return fetchJSON(url);
}

export async function getTransactions(
  ticker?: string,
  username?: string,
  limit?: number
): Promise<Transaction[]> {
  const params = new URLSearchParams();
  if (ticker) params.set('ticker', ticker);
  if (username) params.set('username', username);
  if (limit) params.set('limit', limit.toString());
  const query = params.toString();
  return fetchJSON(`${API_BASE}/trading/transactions${query ? `?${query}` : ''}`);
}

// Posts
export async function createPost(
  userId: number,
  content: string,
  mentionedTicker?: string
): Promise<Post> {
  return fetchJSON(`${API_BASE}/posts`, {
    method: 'POST',
    body: JSON.stringify({ userId, content, mentionedTicker }),
  });
}

export async function getPosts(ticker?: string, limit?: number): Promise<Post[]> {
  const params = new URLSearchParams();
  if (ticker) params.set('ticker', ticker);
  if (limit) params.set('limit', limit.toString());
  const query = params.toString();
  return fetchJSON(`${API_BASE}/posts${query ? `?${query}` : ''}`);
}

export async function editPost(
  postId: number,
  userId: number,
  content: string
): Promise<Post> {
  return fetchJSON(`${API_BASE}/posts/${postId}`, {
    method: 'PUT',
    body: JSON.stringify({ userId, content }),
  });
}

export async function deletePost(postId: number, userId: number): Promise<void> {
  return fetchJSON(`${API_BASE}/posts/${postId}?userId=${userId}`, {
    method: 'DELETE',
  });
}

// Bot
export interface BotPrompt {
  promptId: number | null;
  promptText: string;
  isActive: boolean;
  version: number;
  lastModified?: string;
}

export interface BotActivityLog {
  logId: number;
  actionType: string;
  actionDetails: Record<string, unknown>;
  result: Record<string, unknown>;
  timestamp: string;
}

export interface BotTool {
  name: string;
  description: string;
}

export async function getBotPrompt(userId: number): Promise<BotPrompt> {
  return fetchJSON(`${API_BASE}/bot/prompt/${userId}`);
}

export async function saveBotPrompt(
  userId: number,
  promptText: string
): Promise<{ success: boolean; promptId: number; version: number }> {
  return fetchJSON(`${API_BASE}/bot/prompt`, {
    method: 'POST',
    body: JSON.stringify({ userId, promptText }),
  });
}

export async function toggleBot(
  userId: number,
  isActive: boolean
): Promise<{ success: boolean; isActive: boolean }> {
  return fetchJSON(`${API_BASE}/bot/toggle`, {
    method: 'POST',
    body: JSON.stringify({ userId, isActive }),
  });
}

export async function runBotOnce(userId: number): Promise<{
  success?: boolean;
  error?: string;
  toolCallCount?: number;
  executionLog?: Array<{ action: string; result: unknown }>;
}> {
  return fetchJSON(`${API_BASE}/bot/run-once`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function getBotLogs(userId: number, limit = 50): Promise<BotActivityLog[]> {
  return fetchJSON(`${API_BASE}/bot/logs/${userId}?limit=${limit}`);
}

export async function getBotTools(): Promise<BotTool[]> {
  return fetchJSON(`${API_BASE}/bot/tools`);
}

export interface BotStatus {
  loopRunning: boolean;
  activeBotsCount: number;
  executionInterval: number;
  currentBot: { userId: number; username: string } | null;
  queue: Array<{ userId: number; username: string }>;
  lastCycleStart: string | null;
  lastCycleEnd: string | null;
  isExecuting: boolean;
}

export async function getBotStatus(): Promise<BotStatus> {
  return fetchJSON(`${API_BASE}/bot/admin/status`);
}
