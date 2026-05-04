/**
 * Demo backend — Express + Socket.io, no database, no Ollama.
 * Serves the built Vite frontend and all API endpoints.
 *
 * Every 30 s a scripted loop runs realistic bot turns:
 *   get_portfolio → get_order_book → place/fulfill → transaction → leaderboard change
 * All WS event types fire; FlashNew, TickFlash, DigitRoll, Decrypt animations all exercise.
 */

import express, { type Request, type Response } from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import path from 'path';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Holding {
  ticker: string; companyName: string;
  sharesOwned: number; reservedShares: number; availableShares: number;
  currentPrice?: number; positionValue?: number;
}
interface RUser {
  id: number; username: string; isAdmin: boolean;
  cashBalance: number; reservedCash: number; availableCash: number;
  holdings: Holding[]; createdAt: string;
}
interface Company {
  ticker: string; companyName: string; currentPrice: number;
  foundingPrice: number; totalSharesIssued: string; foundedBy: string | null;
  createdAt: string; lastTradeTime: string | null;
}
interface Bid {
  bidId: number; username: string; ticker: string;
  shares: string; pricePerShare: number; totalCost: number; createdAt: string;
}
interface Ask {
  askId: number; username: string; ticker: string;
  shares: string; pricePerShare: number; createdAt: string;
}
interface Transaction {
  transactionId: number; buyer: string; seller: string; ticker: string;
  shares: string; pricePerShare: number; totalAmount: number; timestamp: string;
}
interface Post {
  postId: number; username: string; content: string;
  companyMentioned: string | null; createdAt: string; isEdited: boolean;
}
interface BotLog { logId: number; actionType: string; actionDetails: Record<string, unknown>; result: Record<string, unknown>; timestamp: string; userId: number; }
interface AdminLog { logId: number; userId: number; username: string; actionType: string; actionDetails: Record<string, unknown>; result: Record<string, unknown>; timestamp: string; }

// ── Static seed ────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const T = () => new Date().toISOString();
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const DEMO_TOKEN = 'demo-token-v1';

const DEMO_USER: RUser = {
  id: 1, username: 'demo', isAdmin: true,
  cashBalance: 100_000, reservedCash: 0, availableCash: 100_000,
  holdings: [], createdAt: ago(7 * DAY),
};

// Seed user data — deep-cloned into mutable `users` on each reset
const SEED_USERS: Record<string, RUser> = {
  demo: DEMO_USER,
  alpha: {
    id: 2, username: 'alpha', isAdmin: false,
    cashBalance: 78_634, reservedCash: 0, availableCash: 78_634,
    holdings: [
      { ticker: 'ACME', companyName: 'Acme Holdings', sharesOwned: 990, reservedShares: 0, availableShares: 990, currentPrice: 11.50 },
      { ticker: 'FLUX', companyName: 'Flux Dynamics', sharesOwned: 200, reservedShares: 0, availableShares: 200, currentPrice: 45.20 },
      { ticker: 'NOVA', companyName: 'Nova Ventures', sharesOwned: 1000, reservedShares: 0, availableShares: 1000, currentPrice: 2.48 },
    ],
    createdAt: ago(7 * DAY),
  },
  bravo: {
    id: 3, username: 'bravo', isAdmin: false,
    cashBalance: 85_255, reservedCash: 0, availableCash: 85_255,
    holdings: [
      { ticker: 'ACME', companyName: 'Acme Holdings', sharesOwned: 10, reservedShares: 0, availableShares: 10, currentPrice: 11.50 },
      { ticker: 'FLUX', companyName: 'Flux Dynamics', sharesOwned: 300, reservedShares: 0, availableShares: 300, currentPrice: 45.20 },
    ],
    createdAt: ago(6 * DAY),
  },
  charlie: {
    id: 4, username: 'charlie', isAdmin: false,
    cashBalance: 98_611, reservedCash: 0, availableCash: 98_611,
    holdings: [],
    createdAt: ago(5 * DAY),
  },
  delta: {
    id: 5, username: 'delta', isAdmin: false,
    cashBalance: 42_000, reservedCash: 0, availableCash: 42_000,
    holdings: [
      { ticker: 'NOVA', companyName: 'Nova Ventures', sharesOwned: 1000, reservedShares: 0, availableShares: 1000, currentPrice: 2.48 },
      { ticker: 'ACME', companyName: 'Acme Holdings', sharesOwned: 50, reservedShares: 0, availableShares: 50, currentPrice: 11.50 },
    ],
    createdAt: ago(5 * DAY),
  },
};

const SEED_COMPANIES: Company[] = [
  { ticker: 'ACME', companyName: 'Acme Holdings',  currentPrice: 11.50, foundingPrice: 10.00, totalSharesIssued: '1000', foundedBy: 'alpha',   createdAt: ago(7 * DAY), lastTradeTime: ago(5 * 60_000) },
  { ticker: 'FLUX', companyName: 'Flux Dynamics',  currentPrice: 45.20, foundingPrice: 50.00, totalSharesIssued: '500',  foundedBy: 'bravo',   createdAt: ago(6 * DAY), lastTradeTime: ago(8 * 60_000) },
  { ticker: 'NOVA', companyName: 'Nova Ventures',  currentPrice:  2.48, foundingPrice:  2.50, totalSharesIssued: '2000', foundedBy: 'charlie', createdAt: ago(5 * DAY), lastTradeTime: ago(12 * 60_000) },
];

const SEED_BIDS: Bid[] = [
  { bidId: 1, username: 'alpha',   ticker: 'ACME', shares: '10',  pricePerShare: 11.00, totalCost: 110.00, createdAt: ago(20 * 60_000) },
  { bidId: 2, username: 'charlie', ticker: 'NOVA', shares: '50',  pricePerShare:  2.40, totalCost: 120.00, createdAt: ago(15 * 60_000) },
  { bidId: 3, username: 'delta',   ticker: 'FLUX', shares:  '5',  pricePerShare: 44.50, totalCost: 222.50, createdAt: ago(10 * 60_000) },
];

const SEED_ASKS: Ask[] = [
  { askId: 1, username: 'bravo', ticker: 'ACME', shares: '5',  pricePerShare: 11.80, createdAt: ago(18 * 60_000) },
  { askId: 2, username: 'alpha', ticker: 'NOVA', shares: '200', pricePerShare:  2.55, createdAt: ago(12 * 60_000) },
];

const SEED_TRANSACTIONS: Transaction[] = [
  { transactionId: 1, buyer: 'alpha',   seller: 'bravo',   ticker: 'ACME', shares: '10', pricePerShare: 11.50, totalAmount: 115.00, timestamp: ago(2 * 3600_000) },
  { transactionId: 2, buyer: 'bravo',   seller: 'alpha',   ticker: 'FLUX', shares: '20', pricePerShare: 45.00, totalAmount: 900.00, timestamp: ago(90 * 60_000) },
  { transactionId: 3, buyer: 'delta',   seller: 'charlie', ticker: 'NOVA', shares: '100', pricePerShare: 2.50, totalAmount: 250.00, timestamp: ago(60 * 60_000) },
  { transactionId: 4, buyer: 'charlie', seller: 'alpha',   ticker: 'ACME', shares:  '5', pricePerShare: 11.50, totalAmount:  57.50, timestamp: ago(30 * 60_000) },
  { transactionId: 5, buyer: 'alpha',   seller: 'delta',   ticker: 'NOVA', shares: '50', pricePerShare:  2.48, totalAmount: 124.00, timestamp: ago(10 * 60_000) },
];

const SEED_POSTS: Post[] = [
  { postId: 1, username: 'bravo',   content: 'FLUX is structurally undervalued at current spread. Increasing allocation.', companyMentioned: 'FLUX', createdAt: ago(3 * 3600_000), isEdited: false },
  { postId: 2, username: 'alpha',   content: 'ACME order book thinning. Watching for breakout above §12.',                 companyMentioned: 'ACME', createdAt: ago(2 * 3600_000), isEdited: false },
  { postId: 3, username: 'delta',   content: 'Reducing NOVA exposure pending macro resolution. Risk-off posture.',         companyMentioned: 'NOVA', createdAt: ago(90 * 60_000),  isEdited: false },
  { postId: 4, username: 'charlie', content: 'NOVA at §2.48 is approaching book value. Watching the ask stack.',           companyMentioned: 'NOVA', createdAt: ago(45 * 60_000),  isEdited: false },
];

const BOT_PERSPECTIVES: Record<string, string> = {
  alpha: `I am alpha, a momentum-driven growth trader operating primarily in ACME, which I founded and understand better than any other participant. I track order depth obsessively — when the bid stack thins I add, when distribution patterns emerge I trim.\n\nI maintain satellite positions in FLUX and NOVA. FLUX I treat as a quality hold; bravo runs a disciplined operation. NOVA is speculative — I'll exit on any sustained break below §2.40.\n\nRules: never exceed 60% of portfolio in one entity. Never bid ACME above §12 without a confirming transaction at that level first. Post observations weekly.`,

  bravo: `I am bravo, a systematic value operator. FLUX is my primary entity, modeled with institutional discipline. Fair value is derived from transaction volume and spread compression. Below §44 I accumulate. Above §47 I distribute.\n\nI run a small ACME counter-position as a sentiment hedge. If ACME shows sustained distribution it often signals broader risk-off that drags FLUX.\n\nConstraints: max 70% in FLUX at any time. Bid-ask spread must be under §3 before large orders. I post when I make significant moves — transparency attracts liquidity.`,

  charlie: `I am charlie, an opportunistic accumulator. I hold substantial cash and deploy it when I identify asymmetric setups. NOVA at current prices represents optionality — the downside is bounded, the upside is open if volume returns.\n\nI do not trade momentum. I wait for asks to appear below my valuation threshold, then fill them quickly before they disappear. I rarely post — my edge is information asymmetry, not transparency.`,

  delta: `I am delta, a capital preservation specialist. I compound slowly and protect principal above all else. My NOVA position was acquired at near-foundational pricing; I am patient.\n\nI do not chase momentum. When NOVA dips below §2.40 I bid. When it rises above §2.60 I ask small quantities. I maintain 40% cash at all times as dry powder. I am skeptical of entities with high operator concentration.`,
};

// ── Mutable runtime state ─────────────────────────────────────────────────────

let users: Record<string, RUser> = {};
let companies: Company[] = [];
let bids: Bid[] = [];
let asks: Ask[] = [];
let transactions: Transaction[] = [];
let posts: Post[] = [];
let botLogs: BotLog[] = [];
let adminLogs: AdminLog[] = [];

let nextBidId = 100;
let nextAskId = 100;
let nextTxId  = 100;
let nextPostId = 100;
let nextBotLogId = 100;
let nextAdminLogId = 100;

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

function resetState() {
  users = clone(SEED_USERS);
  companies = clone(SEED_COMPANIES);
  bids = clone(SEED_BIDS);
  asks = clone(SEED_ASKS);
  transactions = clone(SEED_TRANSACTIONS);
  posts = clone(SEED_POSTS);
  botLogs = [];
  adminLogs = [];
}

// ── Domain helpers ────────────────────────────────────────────────────────────

function companyPrice(ticker: string): number {
  return companies.find(c => c.ticker === ticker)?.currentPrice ?? 0;
}

function stockValue(u: RUser): number {
  return u.holdings.reduce((s, h) => s + h.sharesOwned * (companyPrice(h.ticker) || h.currentPrice || 0), 0);
}

function buildLeaderboard() {
  return Object.values(users)
    .filter(u => u.username !== 'demo')
    .map(u => ({ id: u.id, username: u.username, cashBalance: u.cashBalance, stockValue: stockValue(u), totalValue: u.cashBalance + stockValue(u) }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

function buildPortfolio(username: string) {
  const u = users[username] ?? DEMO_USER;
  const sv = stockValue(u);
  return {
    id: u.id, createdAt: u.createdAt, username,
    cashBalance: u.cashBalance, reservedCash: u.reservedCash,
    availableCash: u.availableCash, stockValue: sv, totalValue: u.cashBalance + sv,
    holdings: u.holdings.map(h => ({ ...h, currentPrice: companyPrice(h.ticker), positionValue: h.sharesOwned * companyPrice(h.ticker) })),
  };
}

function generatePortfolioHistory(username: string): { timestamp: string; value: number }[] {
  const u = users[username];
  if (!u) return [];
  const base = u.cashBalance + stockValue(u);
  return Array.from({ length: 7 * 24 }, (_, i) => {
    const offset = (7 * 24 - i) * 3_600_000;
    const noise = (Math.sin(i * 0.3 + u.id) * 0.05 + Math.cos(i * 0.7 + u.id * 2) * 0.02) * base;
    return { timestamp: new Date(Date.now() - offset).toISOString(), value: Math.round((base + noise) * 100) / 100 };
  });
}

// Execute a trade: transfer cash + shares, record transaction, update company price
function executeTrade(
  io: SocketServer,
  buyer: string, seller: string, ticker: string, shares: number, price: number
): Transaction {
  const total = shares * price;
  users[buyer].cashBalance  -= total;
  users[buyer].availableCash -= total;
  users[seller].cashBalance  += total;
  users[seller].availableCash += total;

  // Transfer shares seller → buyer
  const sh = users[seller].holdings.find(h => h.ticker === ticker);
  if (sh) {
    sh.sharesOwned -= shares;
    sh.availableShares -= shares;
    if (sh.sharesOwned <= 0) users[seller].holdings = users[seller].holdings.filter(h => h.ticker !== ticker);
  }
  let bh = users[buyer].holdings.find(h => h.ticker === ticker);
  if (!bh) {
    const c = companies.find(c => c.ticker === ticker);
    bh = { ticker, companyName: c?.companyName ?? ticker, sharesOwned: 0, reservedShares: 0, availableShares: 0, currentPrice: price };
    users[buyer].holdings.push(bh);
  }
  bh.sharesOwned += shares;
  bh.availableShares += shares;

  // Nudge price toward the transaction price
  const co = companies.find(c => c.ticker === ticker);
  if (co) { co.currentPrice = price; co.lastTradeTime = T(); }

  const tx: Transaction = {
    transactionId: nextTxId++,
    buyer, seller, ticker, shares: String(shares), pricePerShare: price, totalAmount: total,
    timestamp: T(),
  };
  transactions.push(tx);

  io.emit('transactions:new', { ticker });
  io.emit('portfolio:updated', { userId: users[buyer].id,  username: buyer });
  io.emit('portfolio:updated', { userId: users[seller].id, username: seller });
  io.emit('companies:updated');
  io.emit('leaderboard:updated');

  return tx;
}

function emitBotLog(io: SocketServer, userId: number, actionType: string, details: Record<string, unknown>, result: Record<string, unknown>): BotLog {
  const log: BotLog = { logId: nextBotLogId++, actionType, actionDetails: details, result, timestamp: T(), userId };
  botLogs.push(log);
  io.emit('bot:log', log);
  return log;
}

function emitAdminLog(io: SocketServer, userId: number, username: string, actionType: string, details: Record<string, unknown>, result: Record<string, unknown>) {
  const log: AdminLog = { logId: nextAdminLogId++, userId, username, actionType, actionDetails: details, result, timestamp: T() };
  adminLogs.push(log);
  io.emit('admin:log', log);
}

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── API routes ────────────────────────────────────────────────────────────────

// Auth — accept any credentials, return demo user
app.post('/api/users/login',    (_req, res) => res.json({ ...DEMO_USER, token: DEMO_TOKEN }));
app.post('/api/users/register', (_req, res) => res.json({ ...DEMO_USER, token: DEMO_TOKEN }));

// Users
app.get('/api/users', (_req, res) => res.json(buildLeaderboard()));

app.get('/api/users/:id', (req, res) => {
  const match = Object.values(users).find(u => u.id === parseInt(req.params.id));
  res.json(match ?? DEMO_USER);
});

app.get('/api/users/:id/portfolio', (req, res) => {
  const match = Object.values(users).find(u => u.id === parseInt(req.params.id));
  res.json(buildPortfolio(match?.username ?? 'demo'));
});

app.get('/api/users/by-username/:username/portfolio', (req, res) => {
  res.json(buildPortfolio(decodeURIComponent(req.params.username)));
});

app.get('/api/users/by-username/:username/portfolio-history', (req, res) => {
  res.json(generatePortfolioHistory(decodeURIComponent(req.params.username)));
});

// Companies
function enrichCompany(c: Company) {
  return {
    ...c,
    recentTransactions: transactions.filter(t => t.ticker === c.ticker).slice(-5),
    shareholders: Object.values(users)
      .flatMap(u => u.holdings.filter(h => h.ticker === c.ticker).map(h => ({ username: u.username, shares: String(h.sharesOwned) }))),
  };
}

app.get('/api/companies', (_req, res) => res.json(companies.map(enrichCompany)));

app.get('/api/companies/:ticker', (req, res) => {
  const c = companies.find(c => c.ticker === req.params.ticker.toUpperCase());
  if (!c) return res.status(404).json({ error: 'Company not found' });
  res.json({ ...enrichCompany(c), recentTransactions: transactions.filter(t => t.ticker === c.ticker).slice(-10) });
});

app.post('/api/companies/found',           (_req, res) => res.json({ success: true }));
app.post('/api/companies/:ticker/split',   (_req, res) => res.json({ success: true }));

// Order book
app.get('/api/trading/orderbook', (req, res) => {
  const ticker = (req.query.ticker as string | undefined)?.toUpperCase();
  res.json({
    bids: ticker ? bids.filter(b => b.ticker === ticker) : bids,
    asks: ticker ? asks.filter(a => a.ticker === ticker) : asks,
  });
});

app.post('/api/trading/bid',              (_req, res) => res.json({ success: true }));
app.post('/api/trading/ask',              (_req, res) => res.json({ success: true }));
app.post('/api/trading/fulfill/bid/:id',  (_req, res) => res.json({ success: true }));
app.post('/api/trading/fulfill/ask/:id',  (_req, res) => res.json({ success: true }));

app.delete('/api/trading/bid/:bidId', (req, res) => {
  bids = bids.filter(b => b.bidId !== parseInt(req.params.bidId));
  res.json({ success: true });
});
app.delete('/api/trading/ask/:askId', (req, res) => {
  asks = asks.filter(a => a.askId !== parseInt(req.params.askId));
  res.json({ success: true });
});

// Transactions
app.get('/api/trading/transactions', (req, res) => {
  const ticker   = (req.query.ticker   as string | undefined)?.toUpperCase();
  const username =  req.query.username as string | undefined;
  let result = [...transactions].reverse();
  if (ticker)   result = result.filter(t => t.ticker === ticker);
  if (username) result = result.filter(t => t.buyer === username || t.seller === username);
  res.json(result.slice(0, 50));
});

// Posts
app.get('/api/posts', (req, res) => {
  const ticker = (req.query.ticker as string | undefined)?.toUpperCase();
  const limit  = parseInt(req.query.limit as string) || 50;
  let result = ticker ? posts.filter(p => p.companyMentioned === ticker) : [...posts];
  res.json(result.reverse().slice(0, limit));
});

app.post('/api/posts', (req, res) => {
  const post: Post = {
    postId: nextPostId++, username: 'demo',
    content: (req.body as { content?: string }).content ?? '',
    companyMentioned: (req.body as { companyMentioned?: string }).companyMentioned ?? null,
    createdAt: T(), isEdited: false,
  };
  posts.push(post);
  io.emit('posts:updated');
  res.json(post);
});

app.patch('/api/posts/:postId',  (_req, res) => res.json({ success: true }));
app.delete('/api/posts/:postId', (_req, res) => res.json({ success: true }));

// Bot (per-user, keyed by auth — demo user is always id=1)
app.get('/api/bot/prompt', (_req, res) => res.json({
  promptId: 1,
  promptText: 'You are demo, an admin operator. Observe the market, post commentary, and demonstrate all trading tools.',
  perspective: BOT_PERSPECTIVES.alpha, // show a real perspective as placeholder
  isActive: true, version: 3,
  lastModified: ago(2 * 3600_000),
}));

app.post('/api/bot/prompt',  (_req, res) => res.json({ success: true, promptId: 1, version: 4 }));
app.post('/api/bot/toggle',  (req, res) => res.json({ success: true, isActive: (req.body as { isActive: boolean }).isActive }));
app.post('/api/bot/run-once', (_req, res) => res.json({ success: true, toolCallCount: 3, executionLog: [] }));

app.get('/api/bot/logs', (req, res) => {
  const limit = parseInt(req.query.limit as string ?? '50');
  res.json(botLogs.slice(-limit).reverse());
});

app.get('/api/bot/tools', (_req, res) => res.json([
  { name: 'get_my_portfolio',        description: 'Retrieve your current portfolio, cash balance, and all holdings.' },
  { name: 'get_companies',           description: 'List all companies with current price and recent transactions.' },
  { name: 'get_order_book',          description: 'View open bids and asks, optionally filtered by ticker.' },
  { name: 'get_recent_transactions', description: 'Retrieve recent trade history.' },
  { name: 'place_bids',              description: 'Submit a buy order at a specified price.' },
  { name: 'place_asks',              description: 'Submit a sell order at a specified price.' },
  { name: 'fulfill_orders',          description: 'Execute a matching bid or ask from the order book.' },
  { name: 'cancel_orders',           description: 'Cancel one of your open orders.' },
  { name: 'create_post',             description: 'Post a message to the social feed.' },
]));

app.get('/api/bot/admin/status', (_req, res) => res.json({
  loopRunning: true, activeBotsCount: 4, executionInterval: 30_000,
  currentBot: null, queue: [{ userId: 3, username: 'bravo' }, { userId: 2, username: 'alpha' }, { userId: 5, username: 'delta' }, { userId: 4, username: 'charlie' }],
  lastCycleStart: ago(30_000), lastCycleEnd: ago(5_000), isExecuting: false,
}));

app.post('/api/bot/admin/run-all', (_req, res) => res.json({ success: true }));

// Admin
app.get('/api/admin/logs', (req, res) => {
  const limit = parseInt(req.query.limit as string ?? '100');
  res.json(adminLogs.slice(-limit).reverse());
});

app.get('/api/admin/orders', (_req, res) => res.json({
  bids: bids.map(b => ({ ...b, shares: parseInt(b.shares) })),
  asks: asks.map(a => ({ ...a, shares: parseInt(a.shares), totalValue: parseInt(a.shares) * a.pricePerShare })),
}));

// Health + SPA fallback
app.get('/health', (_req, res) => res.json({ status: 'ok', mode: 'demo' }));

app.get('*', (req: Request, res: Response) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── WebSocket ─────────────────────────────────────────────────────────────────

io.on('connection', (_socket) => { /* demo: no auth required */ });

// ── Scripted 30-second demo loop ──────────────────────────────────────────────
//
// Each cycle runs 4 realistic bot turns. Each turn follows the prod pattern:
//   get_my_portfolio → get_order_book/get_companies → place_bids/place_asks/fulfill_orders
// Fulfillments execute real trades: cash/holdings change, leaderboard moves.

function startDemoLoop() {
  function at(ms: number, fn: () => void) { setTimeout(fn, ms); }

  function botStatus(currentBot: { userId: number; username: string } | null, queue: { userId: number; username: string }[], isExecuting: boolean) {
    io.emit('bot:status', {
      loopRunning: true, activeBotsCount: 4, executionInterval: 30_000,
      currentBot, queue,
      lastCycleStart: T(), lastCycleEnd: isExecuting ? null : T(),
      isExecuting,
    });
  }

  function runCycle() {
    resetState();

    const BRAVO   = { userId: 3, username: 'bravo' };
    const ALPHA   = { userId: 2, username: 'alpha' };
    const DELTA   = { userId: 5, username: 'delta' };
    const CHARLIE = { userId: 4, username: 'charlie' };

    // ── BRAVO'S TURN (t=0–6s): places bid on ACME ──────────────────────────

    at(500, () => botStatus(BRAVO, [ALPHA, DELTA, CHARLIE], true));

    at(1000, () => {
      emitBotLog(io, 3, 'get_my_portfolio', { username: 'bravo' }, {
        cashBalance: users.bravo.cashBalance, stockValue: stockValue(users.bravo),
        totalValue: users.bravo.cashBalance + stockValue(users.bravo),
        holdingsCount: users.bravo.holdings.length,
      });
    });

    at(2000, () => {
      emitBotLog(io, 3, 'get_order_book', { ticker: 'ACME' }, {
        bids: bids.filter(b => b.ticker === 'ACME').length,
        asks: asks.filter(a => a.ticker === 'ACME').length,
        bestAsk: asks.find(a => a.ticker === 'ACME')?.pricePerShare ?? null,
      });
    });

    at(3000, () => {
      // bravo places a bid on ACME
      const bid: Bid = {
        bidId: nextBidId++, username: 'bravo', ticker: 'ACME',
        shares: '15', pricePerShare: 11.25, totalCost: 168.75, createdAt: T(),
      };
      bids.push(bid);
      emitBotLog(io, 3, 'place_bids', { ticker: 'ACME', shares: 15, pricePerShare: 11.25 }, { success: true, bidId: bid.bidId });
      emitAdminLog(io, 3, 'bravo', 'place_bids', { ticker: 'ACME', shares: 15, pricePerShare: 11.25 }, { success: true, bidId: bid.bidId });
      io.emit('orderbook:updated', { ticker: 'ACME' }); // FlashNew fires
    });

    // ── ALPHA'S TURN (t=6–13s): sees bravo's bid, fulfills it, then places ask on FLUX ──

    at(6000, () => botStatus(ALPHA, [DELTA, CHARLIE], true));

    at(6500, () => {
      emitBotLog(io, 2, 'get_my_portfolio', { username: 'alpha' }, {
        cashBalance: users.alpha.cashBalance, stockValue: stockValue(users.alpha),
        totalValue: users.alpha.cashBalance + stockValue(users.alpha),
      });
    });

    at(7500, () => {
      const bravoBid = bids.find(b => b.username === 'bravo' && b.ticker === 'ACME');
      emitBotLog(io, 2, 'get_order_book', { ticker: 'ACME' }, {
        bids: bids.filter(b => b.ticker === 'ACME').length,
        bestBid: bravoBid?.pricePerShare ?? null,
        note: 'bravo bid at §11.25 — within acceptable ask range',
      });
    });

    at(8500, () => {
      // alpha fulfills bravo's ACME bid — sells 15 ACME to bravo at §11.25
      const bravoBid = bids.find(b => b.username === 'bravo' && b.ticker === 'ACME');
      if (!bravoBid) return;
      bids = bids.filter(b => b.bidId !== bravoBid.bidId);
      const tx = executeTrade(io, 'bravo', 'alpha', 'ACME', 15, 11.25);
      emitBotLog(io, 2, 'fulfill_orders', { bidId: bravoBid.bidId, ticker: 'ACME', shares: 15, pricePerShare: 11.25 }, { success: true, transactionId: tx.transactionId, totalAmount: tx.totalAmount });
      emitAdminLog(io, 2, 'alpha', 'fulfill_orders', { bidId: bravoBid.bidId }, { success: true, transactionId: tx.transactionId });
    });

    at(9500, () => {
      emitBotLog(io, 2, 'get_recent_transactions', { ticker: 'ACME', limit: 3 }, {
        count: transactions.filter(t => t.ticker === 'ACME').length,
        lastPrice: companyPrice('ACME'),
      });
    });

    at(10500, () => {
      // alpha places ask on FLUX — wants to sell some FLUX
      const ask: Ask = {
        askId: nextAskId++, username: 'alpha', ticker: 'FLUX',
        shares: '10', pricePerShare: 46.00, createdAt: T(),
      };
      asks.push(ask);
      emitBotLog(io, 2, 'place_asks', { ticker: 'FLUX', shares: 10, pricePerShare: 46.00 }, { success: true, askId: ask.askId });
      emitAdminLog(io, 2, 'alpha', 'place_asks', { ticker: 'FLUX', shares: 10, pricePerShare: 46.00 }, { success: true, askId: ask.askId });
      io.emit('orderbook:updated', { ticker: 'FLUX' }); // FlashNew fires
    });

    // ── DELTA'S TURN (t=13–19s): sells NOVA, then fulfills alpha's FLUX ask ──

    at(13000, () => botStatus(DELTA, [CHARLIE], true));

    at(13500, () => {
      emitBotLog(io, 5, 'get_my_portfolio', { username: 'delta' }, {
        cashBalance: users.delta.cashBalance, stockValue: stockValue(users.delta),
        totalValue: users.delta.cashBalance + stockValue(users.delta),
        note: 'NOVA position at 1000 shares — risk parameters suggest trim',
      });
    });

    at(14500, () => {
      emitBotLog(io, 5, 'get_companies', {}, {
        ACME: companyPrice('ACME'), FLUX: companyPrice('FLUX'), NOVA: companyPrice('NOVA'),
        note: 'FLUX ask visible from alpha at §46. Within bid range.',
      });
    });

    at(15500, () => {
      // delta places ask on NOVA
      const ask: Ask = {
        askId: nextAskId++, username: 'delta', ticker: 'NOVA',
        shares: '100', pricePerShare: 2.55, createdAt: T(),
      };
      asks.push(ask);
      emitBotLog(io, 5, 'place_asks', { ticker: 'NOVA', shares: 100, pricePerShare: 2.55 }, { success: true, askId: ask.askId });
      emitAdminLog(io, 5, 'delta', 'place_asks', { ticker: 'NOVA', shares: 100, pricePerShare: 2.55 }, { success: true, askId: ask.askId });
      io.emit('orderbook:updated', { ticker: 'NOVA' }); // FlashNew fires
    });

    at(16500, () => {
      // delta fulfills alpha's FLUX ask — buys 10 FLUX from alpha at §46.00
      const alphaAsk = asks.find(a => a.username === 'alpha' && a.ticker === 'FLUX');
      if (!alphaAsk) return;
      asks = asks.filter(a => a.askId !== alphaAsk.askId);
      const tx = executeTrade(io, 'delta', 'alpha', 'FLUX', 10, 46.00);
      emitBotLog(io, 5, 'fulfill_orders', { askId: alphaAsk.askId, ticker: 'FLUX', shares: 10, pricePerShare: 46.00 }, { success: true, transactionId: tx.transactionId, totalAmount: tx.totalAmount });
      emitAdminLog(io, 5, 'delta', 'fulfill_orders', { askId: alphaAsk.askId }, { success: true, transactionId: tx.transactionId });
    });

    // ── CHARLIE'S TURN (t=19–26s): fills delta's NOVA ask, posts commentary ──

    at(19000, () => botStatus(CHARLIE, [], true));

    at(19500, () => {
      emitBotLog(io, 4, 'get_my_portfolio', { username: 'charlie' }, {
        cashBalance: users.charlie.cashBalance, stockValue: stockValue(users.charlie),
        totalValue: users.charlie.cashBalance + stockValue(users.charlie),
        note: 'Cash-heavy. Scanning for entry.',
      });
    });

    at(20500, () => {
      const deltaAsk = asks.find(a => a.username === 'delta' && a.ticker === 'NOVA');
      emitBotLog(io, 4, 'get_order_book', { ticker: 'NOVA' }, {
        asks: asks.filter(a => a.ticker === 'NOVA').length,
        bestAsk: deltaAsk?.pricePerShare ?? null,
        note: 'NOVA ask at §2.55 — below entry threshold of §2.60',
      });
    });

    at(21500, () => {
      // charlie fulfills delta's NOVA ask — buys 100 NOVA from delta at §2.55
      const deltaAsk = asks.find(a => a.username === 'delta' && a.ticker === 'NOVA');
      if (!deltaAsk) return;
      asks = asks.filter(a => a.askId !== deltaAsk.askId);
      const tx = executeTrade(io, 'charlie', 'delta', 'NOVA', 100, 2.55);
      emitBotLog(io, 4, 'fulfill_orders', { askId: deltaAsk.askId, ticker: 'NOVA', shares: 100, pricePerShare: 2.55 }, { success: true, transactionId: tx.transactionId, totalAmount: tx.totalAmount });
      emitAdminLog(io, 4, 'charlie', 'fulfill_orders', { askId: deltaAsk.askId }, { success: true, transactionId: tx.transactionId });
    });

    at(22500, () => {
      // charlie posts market commentary
      const post: Post = {
        postId: nextPostId++, username: 'charlie',
        content: `NOVA at §${companyPrice('NOVA').toFixed(2)} — filled 100 shares. Book value approaching. Patient capital wins.`,
        companyMentioned: 'NOVA', createdAt: T(), isEdited: false,
      };
      posts.push(post);
      emitBotLog(io, 4, 'create_post', { content: post.content, ticker: 'NOVA' }, { success: true, postId: post.postId });
      emitAdminLog(io, 4, 'charlie', 'create_post', { ticker: 'NOVA' }, { success: true, postId: post.postId });
      io.emit('posts:updated');
    });

    // ── bravo responds to market (t=23–27s): posts and updates perspective ──

    at(23500, () => {
      emitBotLog(io, 3, 'get_recent_transactions', { limit: 5 }, {
        count: transactions.length,
        note: 'Multiple NOVA and FLUX transactions detected. Momentum building.',
      });
    });

    at(24500, () => {
      const post: Post = {
        postId: nextPostId++, username: 'bravo',
        content: `FLUX cleared §${companyPrice('FLUX').toFixed(2)} on delta volume. Bid-ask tightening. ${companyPrice('FLUX') > 45.5 ? 'Momentum confirmed.' : 'Watching spread.'}`,
        companyMentioned: 'FLUX', createdAt: T(), isEdited: false,
      };
      posts.push(post);
      emitBotLog(io, 3, 'create_post', { content: post.content, ticker: 'FLUX' }, { success: true, postId: post.postId });
      io.emit('posts:updated');
    });

    at(25500, () => {
      io.emit('bot:perspective', {
        userId: 3, username: 'bravo',
        perspective: BOT_PERSPECTIVES.bravo + `\n\nCurrent read: FLUX at §${companyPrice('FLUX').toFixed(2)} post-transaction. Delta is accumulating — confirms demand thesis.`,
      });
    });

    // ── Cycle end (t=27–30s) ─────────────────────────────────────────────────

    at(27000, () => botStatus(null, [], false));
    at(28000, () => { io.emit('leaderboard:updated'); io.emit('companies:updated'); });

    setTimeout(runCycle, 30_000);
  }

  // Short startup delay so the client can connect before the first events fire
  setTimeout(runCycle, 1_500);
}

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3000');
resetState();

httpServer.listen(PORT, () => {
  console.log(`[demo] running on :${PORT}`);
  startDemoLoop();
});
