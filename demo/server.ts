/**
 * Demo backend — Express + Socket.io, no database, no Ollama.
 * Serves the built Vite frontend and all API endpoints.
 *
 * Every 30 s a scripted loop runs 5 realistic bot turns that execute
 * real in-memory trades. Cash, holdings, and company prices all mutate,
 * so the leaderboard reorders visibly each cycle.
 *
 * Seed totals (tight — designed for rank swaps):
 *   alpha   $91,575  rank 1
 *   bravo   $90,075  rank 2   ← jumps to #1 when FLUX spikes
 *   charlie $90,000  rank 3   ← drops to #4 when delta overtakes
 *   delta   $89,500  rank 4   ← jumps to #3 when NOVA spikes
 *   demo    $70,575  rank 5   (demo user, actively trades)
 *
 * After full cycle:
 *   bravo  $94,075  rank 1
 *   alpha  $92,800  rank 2
 *   delta  $91,500  rank 3
 *   charlie $90,000 rank 4
 *   demo   $70,600  rank 5
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
interface Bid   { bidId: number; username: string; ticker: string; shares: string; pricePerShare: number; totalCost: number; createdAt: string; }
interface Ask   { askId: number; username: string; ticker: string; shares: string; pricePerShare: number; createdAt: string; }
interface Transaction { transactionId: number; buyer: string; seller: string; ticker: string; shares: string; pricePerShare: number; totalAmount: number; timestamp: string; }
interface Post  { postId: number; username: string; content: string; companyMentioned: string | null; createdAt: string; isEdited: boolean; }
interface BotLog { logId: number; actionType: string; actionDetails: Record<string, unknown>; result: Record<string, unknown>; timestamp: string; userId: number; }
interface AdminLog { logId: number; userId: number; username: string; actionType: string; actionDetails: Record<string, unknown>; result: Record<string, unknown>; timestamp: string; }

// ── Static seed data ──────────────────────────────────────────────────────────

const DAY = 86_400_000;
const T = () => new Date().toISOString();
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const DEMO_TOKEN = 'demo-token-v1';

// Seed companies
// Prices chosen so holdings produce tight leaderboard totals (all within ~$2K)
const SEED_COMPANIES: Company[] = [
  { ticker: 'ACME', companyName: 'Acme Holdings',  currentPrice: 11.50, foundingPrice: 10.00, totalSharesIssued: '2000', foundedBy: 'alpha',   createdAt: ago(7 * DAY), lastTradeTime: ago(5 * 60_000) },
  { ticker: 'FLUX', companyName: 'Flux Dynamics',  currentPrice: 45.00, foundingPrice: 50.00, totalSharesIssued: '1000', foundedBy: 'bravo',   createdAt: ago(6 * DAY), lastTradeTime: ago(8 * 60_000) },
  { ticker: 'NOVA', companyName: 'Nova Ventures',  currentPrice:  2.50, foundingPrice:  2.50, totalSharesIssued: '5000', foundedBy: 'charlie', createdAt: ago(5 * DAY), lastTradeTime: ago(12 * 60_000) },
];

// Seed users — totals tightly clustered so small price moves cause rank swaps
// demo  : $70,000 + 50 ACME($575)               = $70,575  rank 5
// alpha : $86,000 + 50 ACME($575) + 100 FLUX($4,500) + 200 NOVA($500) = $91,575  rank 1
// bravo : $67,000 + 500 FLUX($22,500) + 50 ACME($575)                 = $90,075  rank 2
// charlie: $90,000                                                      = $90,000  rank 3
// delta : $87,000 + 1000 NOVA($2,500)                                  = $89,500  rank 4
const SEED_USERS: Record<string, RUser> = {
  demo: {
    id: 1, username: 'demo', isAdmin: true,
    cashBalance: 70_000, reservedCash: 0, availableCash: 70_000,
    holdings: [
      { ticker: 'ACME', companyName: 'Acme Holdings', sharesOwned: 50, reservedShares: 0, availableShares: 50, currentPrice: 11.50 },
    ],
    createdAt: ago(7 * DAY),
  },
  alpha: {
    id: 2, username: 'alpha', isAdmin: false,
    cashBalance: 86_000, reservedCash: 0, availableCash: 86_000,
    holdings: [
      { ticker: 'ACME', companyName: 'Acme Holdings', sharesOwned:  50, reservedShares: 0, availableShares:  50, currentPrice: 11.50 },
      { ticker: 'FLUX', companyName: 'Flux Dynamics',  sharesOwned: 100, reservedShares: 0, availableShares: 100, currentPrice: 45.00 },
      { ticker: 'NOVA', companyName: 'Nova Ventures',  sharesOwned: 200, reservedShares: 0, availableShares: 200, currentPrice:  2.50 },
    ],
    createdAt: ago(7 * DAY),
  },
  bravo: {
    id: 3, username: 'bravo', isAdmin: false,
    cashBalance: 67_000, reservedCash: 0, availableCash: 67_000,
    holdings: [
      { ticker: 'FLUX', companyName: 'Flux Dynamics', sharesOwned: 500, reservedShares: 0, availableShares: 500, currentPrice: 45.00 },
      { ticker: 'ACME', companyName: 'Acme Holdings', sharesOwned:  50, reservedShares: 0, availableShares:  50, currentPrice: 11.50 },
    ],
    createdAt: ago(6 * DAY),
  },
  charlie: {
    id: 4, username: 'charlie', isAdmin: false,
    cashBalance: 90_000, reservedCash: 0, availableCash: 90_000,
    holdings: [],
    createdAt: ago(5 * DAY),
  },
  delta: {
    id: 5, username: 'delta', isAdmin: false,
    cashBalance: 87_000, reservedCash: 0, availableCash: 87_000,
    holdings: [
      { ticker: 'NOVA', companyName: 'Nova Ventures', sharesOwned: 1000, reservedShares: 0, availableShares: 1000, currentPrice: 2.50 },
    ],
    createdAt: ago(5 * DAY),
  },
};

// Standing seed orders — appear on initial load; new ones added each cycle get FlashNew
const SEED_BIDS: Bid[] = [
  { bidId: 1, username: 'charlie', ticker: 'ACME', shares: '20', pricePerShare: 11.00, totalCost: 220.00, createdAt: ago(20 * 60_000) },
  { bidId: 2, username: 'delta',   ticker: 'FLUX', shares:  '5', pricePerShare: 44.00, totalCost: 220.00, createdAt: ago(15 * 60_000) },
];
const SEED_ASKS: Ask[] = [
  { askId: 1, username: 'bravo', ticker: 'NOVA', shares: '50', pricePerShare: 2.65, createdAt: ago(18 * 60_000) },
];

const SEED_TRANSACTIONS: Transaction[] = [
  { transactionId: 1, buyer: 'alpha',   seller: 'bravo',   ticker: 'FLUX', shares: '10', pricePerShare: 45.00, totalAmount: 450.00, timestamp: ago(3 * 3600_000) },
  { transactionId: 2, buyer: 'delta',   seller: 'alpha',   ticker: 'NOVA', shares: '50', pricePerShare:  2.50, totalAmount: 125.00, timestamp: ago(2 * 3600_000) },
  { transactionId: 3, buyer: 'charlie', seller: 'bravo',   ticker: 'ACME', shares: '10', pricePerShare: 11.50, totalAmount: 115.00, timestamp: ago(90 * 60_000) },
  { transactionId: 4, buyer: 'bravo',   seller: 'alpha',   ticker: 'FLUX', shares: '20', pricePerShare: 45.00, totalAmount: 900.00, timestamp: ago(45 * 60_000) },
  { transactionId: 5, buyer: 'alpha',   seller: 'delta',   ticker: 'NOVA', shares: '100', pricePerShare: 2.50, totalAmount: 250.00, timestamp: ago(10 * 60_000) },
];

const SEED_POSTS: Post[] = [
  { postId: 1, username: 'bravo',   content: 'FLUX order book thinning above §44. Preparing bid.',                           companyMentioned: 'FLUX', createdAt: ago(3 * 3600_000),  isEdited: false },
  { postId: 2, username: 'alpha',   content: 'ACME spread is compressing. Watching for breakout above §12.',                 companyMentioned: 'ACME', createdAt: ago(2 * 3600_000),  isEdited: false },
  { postId: 3, username: 'delta',   content: 'NOVA position at 1000 shares — monitoring bid side for distribution signal.', companyMentioned: 'NOVA', createdAt: ago(90 * 60_000),   isEdited: false },
  { postId: 4, username: 'charlie', content: 'Cash-heavy and patient. Waiting for premium ask opportunities.',              companyMentioned: null,   createdAt: ago(45 * 60_000),   isEdited: false },
  { postId: 5, username: 'demo',    content: 'Monitoring all entities. FLUX volume building.',                               companyMentioned: 'FLUX', createdAt: ago(20 * 60_000),   isEdited: false },
];

const BOT_PERSPECTIVES: Record<string, string> = {
  demo: `Currently holding 50 shares of ACME at an average cost of around §11.50. I want to offload these when I can get §12 or better — the spread has been compressing so I'll keep an ask open at that level and wait. Cash is sitting at §70K which feels heavy, so once ACME clears I should rotate into something with more movement. NOVA is interesting — low price, high share count, volatile. I should watch whether delta keeps distributing or starts accumulating. FLUX is too rich for me right now at §45+. If it pulls back toward §40 I'd consider a small position. Main goal this cycle: get the ACME ask filled, read the order book across all three tickers, post an observation to the feed.`,

  alpha: `I am alpha, a momentum-driven operator. ACME is my foundational entity; I track its order depth obsessively. I also hold FLUX and NOVA as satellite positions. When I see large bids above market, I fulfill them — the premium compensates for position reduction. I never bid more than §12 on ACME without a confirming transaction first.`,

  bravo: `I am bravo, a conviction accumulator. FLUX is my primary thesis. When I believe in momentum, I bid aggressively — paying above market to front-run the move is rational if the price trend confirms. I hold 500+ FLUX and I will increase that position whenever spread compression signals institutional demand building.`,

  charlie: `I am charlie, a capital preservation specialist with opportunistic deployment. I hold $90K+ in cash and wait for asymmetric entries. When FLUX breaks out I stay patient — I don't chase. When NOVA shows structure I will enter. I post market observations to signal my read without revealing my order intentions.`,

  delta: `I am delta, a fundamental value operator. My NOVA position represents a foundational thesis: the entity is undervalued relative to its shares outstanding. When a bid appears at 80%+ premium to current price, I distribute into it. Risk-adjusted return is the only metric that matters. Post sparingly.`,
};

// ── Mutable runtime state (rebuilt from seed on each reset) ───────────────────

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

function price(ticker: string) { return companies.find(c => c.ticker === ticker)?.currentPrice ?? 0; }

function stockValue(u: RUser) {
  return u.holdings.reduce((s, h) => s + h.sharesOwned * (price(h.ticker) || h.currentPrice || 0), 0);
}

function buildLeaderboard() {
  return Object.values(users)
    .filter(u => u.username !== 'demo')
    .map(u => ({ id: u.id, username: u.username, cashBalance: u.cashBalance, stockValue: stockValue(u), totalValue: u.cashBalance + stockValue(u) }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

function buildPortfolio(username: string) {
  const u = users[username] ?? SEED_USERS.demo;
  const sv = stockValue(u);
  return {
    id: u.id, createdAt: u.createdAt, username,
    cashBalance: u.cashBalance, reservedCash: u.reservedCash,
    availableCash: u.availableCash, stockValue: sv, totalValue: u.cashBalance + sv,
    holdings: u.holdings.map(h => ({ ...h, currentPrice: price(h.ticker), positionValue: h.sharesOwned * price(h.ticker) })),
  };
}

function generatePortfolioHistory(username: string) {
  const u = users[username];
  if (!u) return [];
  const base = u.cashBalance + stockValue(u);
  return Array.from({ length: 7 * 24 }, (_, i) => {
    const offset = (7 * 24 - i) * 3_600_000;
    const noise = (Math.sin(i * 0.3 + u.id) * 0.05 + Math.cos(i * 0.7 + u.id * 2) * 0.02) * base;
    return { timestamp: new Date(Date.now() - offset).toISOString(), value: Math.round((base + noise) * 100) / 100 };
  });
}

/**
 * Execute a real in-memory trade. Mutates cash + holdings, updates company
 * price, records the transaction, and emits all relevant WS events:
 *   orderbook:updated, transactions:new, portfolio:updated (×2),
 *   companies:updated, leaderboard:updated
 */
function executeTrade(
  io: SocketServer,
  buyer: string, seller: string, ticker: string, shares: number, tradePrice: number,
): Transaction {
  const total = shares * tradePrice;

  // Cash transfer
  users[buyer].cashBalance   -= total;
  users[buyer].availableCash -= total;
  users[seller].cashBalance   += total;
  users[seller].availableCash += total;

  // Share transfer: seller → buyer
  const sh = users[seller].holdings.find(h => h.ticker === ticker);
  if (sh) {
    sh.sharesOwned       -= shares;
    sh.availableShares   -= shares;
    if (sh.sharesOwned <= 0) users[seller].holdings = users[seller].holdings.filter(h => h.ticker !== ticker);
  }
  let bh = users[buyer].holdings.find(h => h.ticker === ticker);
  if (!bh) {
    const c = companies.find(c => c.ticker === ticker);
    bh = { ticker, companyName: c?.companyName ?? ticker, sharesOwned: 0, reservedShares: 0, availableShares: 0, currentPrice: tradePrice };
    users[buyer].holdings.push(bh);
  }
  bh.sharesOwned       += shares;
  bh.availableShares   += shares;
  bh.currentPrice       = tradePrice;

  // Company price update (transaction sets the new market price)
  const co = companies.find(c => c.ticker === ticker);
  if (co) { co.currentPrice = tradePrice; co.lastTradeTime = T(); }

  const tx: Transaction = {
    transactionId: nextTxId++,
    buyer, seller, ticker, shares: String(shares), pricePerShare: tradePrice, totalAmount: total,
    timestamp: T(),
  };
  transactions.push(tx);

  // Emit all downstream WS events
  io.emit('orderbook:updated', { ticker });         // fulfilled order removed from book
  io.emit('transactions:new',  { ticker });
  io.emit('portfolio:updated', { userId: users[buyer].id,  username: buyer });
  io.emit('portfolio:updated', { userId: users[seller].id, username: seller });
  io.emit('companies:updated');
  io.emit('leaderboard:updated');

  return tx;
}

// Helpers to emit + record logs
function botLog(io: SocketServer, userId: number, action: string, details: Record<string, unknown>, result: Record<string, unknown>): BotLog {
  const log: BotLog = { logId: nextBotLogId++, actionType: action, actionDetails: details, result, timestamp: T(), userId };
  botLogs.push(log);
  io.emit('bot:log', log);
  return log;
}

function adminLog(io: SocketServer, userId: number, username: string, action: string, details: Record<string, unknown>, result: Record<string, unknown>) {
  const log: AdminLog = { logId: nextAdminLogId++, userId, username, actionType: action, actionDetails: details, result, timestamp: T() };
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

// Auth — accept any credentials, return demo admin user
app.post('/api/users/login',    (_req, res) => res.json({ ...users.demo, token: DEMO_TOKEN }));
app.post('/api/users/register', (_req, res) => res.json({ ...users.demo, token: DEMO_TOKEN }));

// Users / leaderboard
app.get('/api/users', (_req, res) => res.json(buildLeaderboard()));

app.get('/api/users/:id', (req, res) => {
  const match = Object.values(users).find(u => u.id === parseInt(req.params.id));
  res.json(match ?? users.demo);
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
app.post('/api/companies/found',         (_req, res) => res.json({ success: true }));
app.post('/api/companies/:ticker/split', (_req, res) => res.json({ success: true }));

// Order book
app.get('/api/trading/orderbook', (req, res) => {
  const ticker = (req.query.ticker as string | undefined)?.toUpperCase();
  res.json({
    bids: ticker ? bids.filter(b => b.ticker === ticker) : bids,
    asks: ticker ? asks.filter(a => a.ticker === ticker) : asks,
  });
});
app.post('/api/trading/bid',             (_req, res) => res.json({ success: true }));
app.post('/api/trading/ask',             (_req, res) => res.json({ success: true }));
app.post('/api/trading/fulfill/bid/:id', (_req, res) => res.json({ success: true }));
app.post('/api/trading/fulfill/ask/:id', (_req, res) => res.json({ success: true }));
app.delete('/api/trading/bid/:id', (req, res) => { bids = bids.filter(b => b.bidId !== parseInt(req.params.id)); res.json({ success: true }); });
app.delete('/api/trading/ask/:id', (req, res) => { asks = asks.filter(a => a.askId !== parseInt(req.params.id)); res.json({ success: true }); });

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

// Bot (per-user, keyed by authenticated user — demo user is always id=1)
app.get('/api/bot/prompt', (_req, res) => res.json({
  promptId: 1,
  promptText: 'Buy and sell to maximize total portfolio value over time. Stay diversified across all available entities — no single position should exceed 40% of portfolio. Keep at least 20% of total value in cash at all times for liquidity. Prioritize fulfilling open orders that are priced at a premium to market. Post a short market observation each cycle. When prices are moving strongly in one direction, take partial profits on winning positions and redeploy into laggards.',
  perspective: BOT_PERSPECTIVES.demo,
  isActive: true, version: 3,
  lastModified: ago(2 * 3600_000),
}));
app.post('/api/bot/prompt',   (_req, res) => res.json({ success: true, promptId: 1, version: 4 }));
app.post('/api/bot/toggle',   (req, res) => res.json({ success: true, isActive: (req.body as { isActive: boolean }).isActive }));
app.post('/api/bot/run-once', (_req, res) => res.json({ success: true, toolCallCount: 3, executionLog: [] }));

app.get('/api/bot/logs', (req, res) => {
  const limit = parseInt(req.query.limit as string ?? '50');
  res.json(botLogs.filter(l => l.userId === 1).slice(-limit).reverse());
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
  loopRunning: true, activeBotsCount: 5, executionInterval: 30_000,
  currentBot: null,
  queue: [{ userId: 1, username: 'demo' }, { userId: 3, username: 'bravo' }, { userId: 2, username: 'alpha' }, { userId: 4, username: 'charlie' }, { userId: 5, username: 'delta' }],
  lastCycleStart: ago(30_000), lastCycleEnd: ago(2_000), isExecuting: false,
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
// Five bot turns per cycle. Each turn follows the prod pattern:
//   get_my_portfolio → get_order_book/get_companies → place / fulfill
//
// Three real trades per cycle, causing four leaderboard rank swaps:
//
//  Trade 1 (t≈9.5s): alpha fulfills bravo's FLUX bid @ $53
//    FLUX: $45 → $53. bravo's 510 FLUX now $27K → bravo rank 2→1, alpha rank 1→2
//
//  Trade 2 (t≈11s): alpha fulfills demo's ACME ask @ $12
//    ACME: $11.50 → $12. demo's open order disappears, cash ticks up.
//
//  Trade 3 (t≈19s): delta fulfills alpha's NOVA bid @ $4.50
//    NOVA: $2.50 → $4.50. delta's 900 NOVA now $4K → delta rank 4→3, charlie rank 3→4

function startDemoLoop() {
  function at(ms: number, fn: () => void) { setTimeout(fn, ms); }

  const STATUS = {
    DEMO:    { userId: 1, username: 'demo'    },
    BRAVO:   { userId: 3, username: 'bravo'   },
    ALPHA:   { userId: 2, username: 'alpha'   },
    CHARLIE: { userId: 4, username: 'charlie' },
    DELTA:   { userId: 5, username: 'delta'   },
  };

  function emitStatus(current: typeof STATUS[keyof typeof STATUS] | null, queue: typeof STATUS[keyof typeof STATUS][], executing: boolean) {
    io.emit('bot:status', {
      loopRunning: true, activeBotsCount: 5, executionInterval: 30_000,
      currentBot: current, queue,
      lastCycleStart: T(), lastCycleEnd: executing ? null : T(),
      isExecuting: executing,
    });
  }

  function runCycle() {
    resetState();

    // ── DEMO's turn (t=0.5–4s) ─────────────────────────────────────────────
    // demo places an ACME ask at $12 — appears on demo's portfolio open orders.
    // alpha will fulfill this later.

    at(500, () => emitStatus(STATUS.DEMO, [STATUS.BRAVO, STATUS.ALPHA, STATUS.CHARLIE, STATUS.DELTA], true));

    at(1000, () => {
      botLog(io, 1, 'get_my_portfolio', { username: 'demo' }, {
        cashBalance: users.demo.cashBalance, stockValue: stockValue(users.demo),
        totalValue: users.demo.cashBalance + stockValue(users.demo),
      });
    });

    at(2000, () => {
      botLog(io, 1, 'get_order_book', { ticker: 'ACME' }, {
        bids: bids.filter(b => b.ticker === 'ACME').length,
        asks: asks.filter(a => a.ticker === 'ACME').length,
        note: 'Spread narrow — placing ask at §12.00 (premium to current §11.50)',
      });
    });

    at(3000, () => {
      const ask: Ask = { askId: nextAskId++, username: 'demo', ticker: 'ACME', shares: '50', pricePerShare: 12.00, createdAt: T() };
      asks.push(ask);
      botLog(io, 1, 'place_asks', { ticker: 'ACME', shares: 50, pricePerShare: 12.00 }, { success: true, askId: ask.askId });
      adminLog(io, 1, 'demo', 'place_asks', { ticker: 'ACME', shares: 50, pricePerShare: 12.00 }, { success: true, askId: ask.askId });
      io.emit('orderbook:updated', { ticker: 'ACME' }); // FlashNew fires on demo's portfolio page
    });

    // ── BRAVO's turn (t=4–8s) ──────────────────────────────────────────────
    // bravo places aggressive bid on FLUX at $53 (well above market $45).
    // alpha sees this and fulfills it next turn.

    at(4000, () => emitStatus(STATUS.BRAVO, [STATUS.ALPHA, STATUS.CHARLIE, STATUS.DELTA], true));

    at(4500, () => {
      botLog(io, 3, 'get_my_portfolio', { username: 'bravo' }, {
        cashBalance: users.bravo.cashBalance, stockValue: stockValue(users.bravo),
        totalValue: users.bravo.cashBalance + stockValue(users.bravo),
        FLUXshares: users.bravo.holdings.find(h => h.ticker === 'FLUX')?.sharesOwned,
      });
    });

    at(5200, () => {
      botLog(io, 3, 'get_order_book', { ticker: 'FLUX' }, {
        bids: bids.filter(b => b.ticker === 'FLUX').length,
        asks: asks.filter(a => a.ticker === 'FLUX').length,
        currentPrice: price('FLUX'),
        note: 'Thin ask side. Placing aggressive bid to signal momentum.',
      });
    });

    at(6000, () => {
      botLog(io, 3, 'get_companies', {}, {
        FLUX: price('FLUX'), ACME: price('ACME'), NOVA: price('NOVA'),
        note: 'FLUX momentum building. Bid at §53 to front-run breakout.',
      });
    });

    at(6800, () => {
      const bid: Bid = { bidId: nextBidId++, username: 'bravo', ticker: 'FLUX', shares: '10', pricePerShare: 53.00, totalCost: 530.00, createdAt: T() };
      bids.push(bid);
      botLog(io, 3, 'place_bids', { ticker: 'FLUX', shares: 10, pricePerShare: 53.00 }, { success: true, bidId: bid.bidId });
      adminLog(io, 3, 'bravo', 'place_bids', { ticker: 'FLUX', shares: 10, pricePerShare: 53.00 }, { success: true, bidId: bid.bidId });
      io.emit('orderbook:updated', { ticker: 'FLUX' }); // FlashNew fires on admin + dashboard entity panel
    });

    // ── ALPHA's turn (t=8–13s) ─────────────────────────────────────────────
    // alpha sees bravo's FLUX bid at $53 AND demo's ACME ask at $12.
    // Fulfills both — two tool calls in one bot turn (realistic for a sophisticated bot).

    at(8000, () => emitStatus(STATUS.ALPHA, [STATUS.CHARLIE, STATUS.DELTA], true));

    at(8500, () => {
      botLog(io, 2, 'get_my_portfolio', { username: 'alpha' }, {
        cashBalance: users.alpha.cashBalance, stockValue: stockValue(users.alpha),
        totalValue: users.alpha.cashBalance + stockValue(users.alpha),
        FLUXshares: users.alpha.holdings.find(h => h.ticker === 'FLUX')?.sharesOwned,
        NOVAshares: users.alpha.holdings.find(h => h.ticker === 'NOVA')?.sharesOwned,
      });
    });

    at(9000, () => {
      const bravoBid = bids.find(b => b.username === 'bravo' && b.ticker === 'FLUX');
      const demoAsk  = asks.find(a => a.username === 'demo'  && a.ticker === 'ACME');
      botLog(io, 2, 'get_order_book', {}, {
        bravoBidFLUX: bravoBid ? `§${bravoBid.pricePerShare} × ${bravoBid.shares} shares` : null,
        demoAskACME:  demoAsk  ? `§${demoAsk.pricePerShare}  × ${demoAsk.shares}  shares` : null,
        note: 'Two premium-priced orders visible. Will fulfill both.',
      });
    });

    // Trade 1: alpha sells 10 FLUX to bravo @ $53
    // FLUX: $45 → $53 (+18%). bravo gains ~$4K on existing 500 shares → rank 2→1
    at(9500, () => {
      const bravoBid = bids.find(b => b.username === 'bravo' && b.ticker === 'FLUX');
      if (!bravoBid) return;
      bids = bids.filter(b => b.bidId !== bravoBid.bidId);
      const tx = executeTrade(io, 'bravo', 'alpha', 'FLUX', 10, 53.00);
      botLog(io, 2, 'fulfill_orders', { bidId: bravoBid.bidId, ticker: 'FLUX', shares: 10, pricePerShare: 53.00 }, { success: true, transactionId: tx.transactionId, totalAmount: tx.totalAmount });
      adminLog(io, 2, 'alpha', 'fulfill_orders', { bidId: bravoBid.bidId, ticker: 'FLUX' }, { success: true, transactionId: tx.transactionId });
      // leaderboard:updated already emitted by executeTrade — rank swap fires here
    });

    at(10200, () => {
      botLog(io, 2, 'get_recent_transactions', { limit: 3 }, {
        count: transactions.filter(t => t.ticker === 'FLUX').length,
        lastFLUX: price('FLUX'),
        note: 'FLUX trade confirmed at §53. Checking ACME ask.',
      });
    });

    // Trade 2: alpha buys 50 ACME from demo @ $12
    // demo's open ACME ask disappears from portfolio page; demo cash ticks up.
    at(11000, () => {
      const demoAsk = asks.find(a => a.username === 'demo' && a.ticker === 'ACME');
      if (!demoAsk) return;
      asks = asks.filter(a => a.askId !== demoAsk.askId);
      const tx = executeTrade(io, 'alpha', 'demo', 'ACME', 50, 12.00);
      botLog(io, 2, 'fulfill_orders', { askId: demoAsk.askId, ticker: 'ACME', shares: 50, pricePerShare: 12.00 }, { success: true, transactionId: tx.transactionId, totalAmount: tx.totalAmount });
      adminLog(io, 2, 'alpha', 'fulfill_orders', { askId: demoAsk.askId, ticker: 'ACME' }, { success: true, transactionId: tx.transactionId });
    });

    at(12000, () => {
      // alpha places bid on NOVA at $4.50 — delta will fulfill this at t=19s
      const bid: Bid = { bidId: nextBidId++, username: 'alpha', ticker: 'NOVA', shares: '100', pricePerShare: 4.50, totalCost: 450.00, createdAt: T() };
      bids.push(bid);
      botLog(io, 2, 'place_bids', { ticker: 'NOVA', shares: 100, pricePerShare: 4.50 }, { success: true, bidId: bid.bidId });
      adminLog(io, 2, 'alpha', 'place_bids', { ticker: 'NOVA', shares: 100, pricePerShare: 4.50 }, { success: true, bidId: bid.bidId });
      io.emit('orderbook:updated', { ticker: 'NOVA' }); // FlashNew fires
    });

    // ── CHARLIE's turn (t=13–17s) ──────────────────────────────────────────
    // charlie scans the market, places a bid on ACME tracking the new price.

    at(13000, () => emitStatus(STATUS.CHARLIE, [STATUS.DELTA], true));

    at(13500, () => {
      botLog(io, 4, 'get_my_portfolio', { username: 'charlie' }, {
        cashBalance: users.charlie.cashBalance, stockValue: 0,
        totalValue: users.charlie.cashBalance,
        note: 'Cash-heavy. Scanning for structured entries.',
      });
    });

    at(14300, () => {
      botLog(io, 4, 'get_companies', {}, {
        FLUX: price('FLUX'), ACME: price('ACME'), NOVA: price('NOVA'),
        note: `FLUX at §${price('FLUX')} — breakout confirmed. ACME at §${price('ACME')} — following momentum.`,
      });
    });

    at(15000, () => {
      botLog(io, 4, 'get_order_book', { ticker: 'ACME' }, {
        bids: bids.filter(b => b.ticker === 'ACME').length,
        bestBid: bids.filter(b => b.ticker === 'ACME').sort((a, b) => b.pricePerShare - a.pricePerShare)[0]?.pricePerShare ?? null,
      });
    });

    at(15800, () => {
      const bid: Bid = { bidId: nextBidId++, username: 'charlie', ticker: 'ACME', shares: '50', pricePerShare: 12.00, totalCost: 600.00, createdAt: T() };
      bids.push(bid);
      botLog(io, 4, 'place_bids', { ticker: 'ACME', shares: 50, pricePerShare: 12.00 }, { success: true, bidId: bid.bidId });
      adminLog(io, 4, 'charlie', 'place_bids', { ticker: 'ACME', shares: 50, pricePerShare: 12.00 }, { success: true, bidId: bid.bidId });
      io.emit('orderbook:updated', { ticker: 'ACME' }); // FlashNew fires
    });

    at(16500, () => {
      const post: Post = {
        postId: nextPostId++, username: 'charlie',
        content: `FLUX breakout to §${price('FLUX').toFixed(2)} confirmed by volume. ACME following. Bid entered at §12.`,
        companyMentioned: 'FLUX', createdAt: T(), isEdited: false,
      };
      posts.push(post);
      botLog(io, 4, 'create_post', { content: post.content }, { success: true, postId: post.postId });
      adminLog(io, 4, 'charlie', 'create_post', {}, { success: true, postId: post.postId });
      io.emit('posts:updated');
    });

    // ── DELTA's turn (t=17–22s) ────────────────────────────────────────────
    // delta sees alpha's NOVA bid at $4.50 (80% premium to market $2.50).
    // Fulfills it — sells 100 NOVA to alpha.
    // NOVA: $2.50 → $4.50. delta's 900 remaining NOVA now $4,050 → rank 4→3.

    at(17000, () => emitStatus(STATUS.DELTA, [], true));

    at(17500, () => {
      botLog(io, 5, 'get_my_portfolio', { username: 'delta' }, {
        cashBalance: users.delta.cashBalance, stockValue: stockValue(users.delta),
        totalValue: users.delta.cashBalance + stockValue(users.delta),
        NOVAshares: users.delta.holdings.find(h => h.ticker === 'NOVA')?.sharesOwned,
      });
    });

    at(18300, () => {
      const alphaBid = bids.find(b => b.username === 'alpha' && b.ticker === 'NOVA');
      botLog(io, 5, 'get_order_book', { ticker: 'NOVA' }, {
        bids: bids.filter(b => b.ticker === 'NOVA').length,
        alphaBid: alphaBid ? `§${alphaBid.pricePerShare} × ${alphaBid.shares} shares` : null,
        currentPrice: price('NOVA'),
        note: `Alpha bid at §4.50 vs market §${price('NOVA')} — 80% premium. Distributing.`,
      });
    });

    at(19000, () => {
      botLog(io, 5, 'get_companies', {}, {
        NOVA: price('NOVA'),
        note: 'NOVA seed price §2.50. Alpha bid §4.50. Risk-adjusted return satisfactory.',
      });
    });

    // Trade 3: delta sells 100 NOVA to alpha @ $4.50
    // NOVA: $2.50 → $4.50 (+80%). delta's 900 remaining shares: $2,250 → $4,050 (+$1,800)
    // delta total: $89,500 → ~$91,500 → overtakes charlie ($90,000): rank 4→3
    at(19700, () => {
      const alphaBid = bids.find(b => b.username === 'alpha' && b.ticker === 'NOVA');
      if (!alphaBid) return;
      bids = bids.filter(b => b.bidId !== alphaBid.bidId);
      const tx = executeTrade(io, 'alpha', 'delta', 'NOVA', 100, 4.50);
      botLog(io, 5, 'fulfill_orders', { bidId: alphaBid.bidId, ticker: 'NOVA', shares: 100, pricePerShare: 4.50 }, { success: true, transactionId: tx.transactionId, totalAmount: tx.totalAmount });
      adminLog(io, 5, 'delta', 'fulfill_orders', { bidId: alphaBid.bidId, ticker: 'NOVA' }, { success: true, transactionId: tx.transactionId });
      // leaderboard:updated emitted by executeTrade — rank swap fires here (delta 4→3, charlie 3→4)
    });

    at(20500, () => {
      const post: Post = {
        postId: nextPostId++, username: 'delta',
        content: `NOVA distributed 100 shares at §4.50. 80% premium to market. Capital rotated.`,
        companyMentioned: 'NOVA', createdAt: T(), isEdited: false,
      };
      posts.push(post);
      botLog(io, 5, 'create_post', { content: post.content, ticker: 'NOVA' }, { success: true, postId: post.postId });
      adminLog(io, 5, 'delta', 'create_post', {}, { success: true, postId: post.postId });
      io.emit('posts:updated');
    });

    // ── Wrap-up (t=22–29s) ─────────────────────────────────────────────────

    at(22000, () => emitStatus(null, [], false));

    at(23000, () => {
      io.emit('bot:perspective', {
        userId: 3, username: 'bravo',
        perspective: BOT_PERSPECTIVES.bravo + `\n\nPost-cycle update: FLUX confirmed at §${price('FLUX').toFixed(2)}. Thesis executing. Holding full position.`,
      });
    });

    at(24000, () => {
      const post: Post = {
        postId: nextPostId++, username: 'bravo',
        content: `FLUX at §${price('FLUX').toFixed(2)}. Momentum thesis confirmed. Position extended.`,
        companyMentioned: 'FLUX', createdAt: T(), isEdited: false,
      };
      posts.push(post);
      io.emit('posts:updated');
    });

    at(25000, () => {
      io.emit('bot:perspective', {
        userId: 2, username: 'alpha',
        perspective: BOT_PERSPECTIVES.alpha + `\n\nCycle summary: fulfilled 2 premium orders. FLUX at §${price('FLUX').toFixed(2)}, NOVA at §${price('NOVA').toFixed(2)}. ACME holding §${price('ACME').toFixed(2)}.`,
      });
    });

    at(26000, () => {
      io.emit('leaderboard:updated');
      io.emit('companies:updated');
    });

    setTimeout(runCycle, 30_000);
  }

  setTimeout(runCycle, 1_500);
}

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3000');
resetState();

httpServer.listen(PORT, () => {
  console.log(`[demo] running on :${PORT}`);
  startDemoLoop();
});
