import { getIo } from './socket';
import type { BotActivityLog } from '../types/socket';

// Safely emit — no-ops if socket server isn't initialized yet
function emit(event: string, ...args: unknown[]) {
  try {
    getIo().emit(event, ...args);
  } catch {
    // socket not initialized (e.g. during tests or early startup)
  }
}

function emitTo(room: string, event: string, ...args: unknown[]) {
  try {
    getIo().to(room).emit(event, ...args);
  } catch {
    // socket not initialized
  }
}

// Invalidation signals — frontend refetches the corresponding query
export function emitCompaniesUpdated() {
  emit('companies:updated');
}

export function emitOrderbookUpdated(ticker?: string) {
  emit('orderbook:updated', { ticker });
}

export function emitLeaderboardUpdated() {
  emit('leaderboard:updated');
}

export function emitPortfolioUpdated(userId: number, username: string) {
  emit('portfolio:updated', { userId, username });
}

export function emitTransactionsNew(ticker?: string) {
  emit('transactions:new', { ticker });
}

export function emitPostsUpdated() {
  emit('posts:updated');
}

// Full-payload pushes — frontend updates cache directly
export function emitBotStatus(status: object) {
  emit('bot:status', status);
}

export function emitBotLog(userId: number, username: string, log: BotActivityLog) {
  emitTo(`user:${userId}`, 'bot:log', { ...log, userId });
  emitTo('admin', 'admin:log', { ...log, userId, username });
}

export function emitBotPerspective(userId: number, username: string, perspective: string) {
  emit('bot:perspective', { userId, username, perspective });
}
