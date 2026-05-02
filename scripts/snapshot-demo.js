/**
 * Run inside the backend container (has compiled dist/ and Prisma client):
 *   docker exec ai_stock_battle_royale-backend-1 node /app/snapshot-demo.js
 * Writes sanitised demo-data.json to stdout — redirect to the client src dir.
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const { getVWAPPrice } = require('./dist/lib/pricing');

const prisma = new PrismaClient();

async function main() {
  // ── Companies ────────────────────────────────────────────────
  const rawCompanies = await prisma.company.findMany({
    include: {
      founder: { select: { username: true } },
      transactions: {
        orderBy: { timestamp: 'desc' },
        take: 10,
        include: {
          buyer: { select: { username: true } },
          seller: { select: { username: true } },
        },
      },
      stockHoldings: {
        where: { sharesOwned: { gt: 0 } },
        orderBy: { sharesOwned: 'desc' },
        take: 10,
        include: { user: { select: { username: true } } },
      },
    },
  });

  const companies = await Promise.all(rawCompanies.map(async (c) => {
    const currentPrice = await getVWAPPrice({
      companyId: c.id,
      foundingCost: c.foundingCost ? Number(c.foundingCost) : null,
      totalSharesIssued: c.totalSharesIssued,
      splitMultiplier: Number(c.splitMultiplier),
    });
    return {
      ticker: c.tickerSymbol,
      companyName: c.companyName,
      currentPrice,
      foundingPrice: c.foundingCost ? Number(c.foundingCost) : null,
      totalSharesIssued: c.totalSharesIssued.toString(),
      foundedBy: c.founder?.username ?? null,
      createdAt: c.createdAt.toISOString(),
      lastTradeTime: c.transactions[0]?.timestamp.toISOString() ?? null,
      recentTransactions: c.transactions.map(tx => ({
        transactionId: tx.id,
        buyer: tx.buyer.username,
        seller: tx.seller.username,
        ticker: c.tickerSymbol,
        shares: tx.sharesTraded.toString(),
        pricePerShare: Number(tx.pricePerShare),
        totalAmount: Number(tx.totalAmount),
        timestamp: tx.timestamp.toISOString(),
      })),
      shareholders: c.stockHoldings.map(h => ({
        username: h.user.username,
        shares: h.sharesOwned.toString(),
      })),
    };
  }));

  // ── Order book ───────────────────────────────────────────────
  const [bids, asks] = await Promise.all([
    prisma.bid.findMany({
      where: { status: 'open' },
      include: { user: { select: { username: true } }, company: { select: { tickerSymbol: true } } },
      orderBy: { pricePerShare: 'desc' },
    }),
    prisma.ask.findMany({
      where: { status: 'open' },
      include: { user: { select: { username: true } }, company: { select: { tickerSymbol: true } } },
      orderBy: { pricePerShare: 'asc' },
    }),
  ]);

  const orderBook = {
    bids: bids.map(b => ({
      bidId: b.id,
      username: b.user.username,
      ticker: b.company.tickerSymbol,
      shares: b.sharesRequested.toString(),
      pricePerShare: Number(b.pricePerShare),
      totalCost: Number(b.totalCost),
      createdAt: b.createdAt.toISOString(),
    })),
    asks: asks.map(a => ({
      askId: a.id,
      username: a.user.username,
      ticker: a.company.tickerSymbol,
      shares: a.sharesOffered.toString(),
      pricePerShare: Number(a.pricePerShare),
      createdAt: a.createdAt.toISOString(),
    })),
  };

  const adminOrders = {
    bids: bids.map(b => ({
      bidId: b.id,
      username: b.user.username,
      ticker: b.company.tickerSymbol,
      shares: Number(b.sharesRequested),
      pricePerShare: Number(b.pricePerShare),
      totalCost: Number(b.totalCost),
      createdAt: b.createdAt.toISOString(),
    })),
    asks: asks.map(a => ({
      askId: a.id,
      username: a.user.username,
      ticker: a.company.tickerSymbol,
      shares: Number(a.sharesOffered),
      pricePerShare: Number(a.pricePerShare),
      totalValue: Number(a.sharesOffered) * Number(a.pricePerShare),
      createdAt: a.createdAt.toISOString(),
    })),
  };

  // ── Transactions ─────────────────────────────────────────────
  const rawTx = await prisma.transaction.findMany({
    orderBy: { timestamp: 'desc' },
    take: 50,
    include: {
      buyer: { select: { username: true } },
      seller: { select: { username: true } },
      company: { select: { tickerSymbol: true } },
    },
  });
  const transactions = rawTx.map(tx => ({
    transactionId: tx.id,
    buyer: tx.buyer.username,
    seller: tx.seller.username,
    ticker: tx.company.tickerSymbol,
    shares: tx.sharesTraded.toString(),
    pricePerShare: Number(tx.pricePerShare),
    totalAmount: Number(tx.totalAmount),
    timestamp: tx.timestamp.toISOString(),
  }));

  // ── Posts ────────────────────────────────────────────────────
  const rawPosts = await prisma.post.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      user: { select: { username: true } },
      mentionedCompany: { select: { tickerSymbol: true } },
    },
  });
  const posts = rawPosts.map(p => ({
    postId: p.id,
    username: p.user.username,
    content: p.content,
    companyMentioned: p.mentionedCompany?.tickerSymbol ?? null,
    createdAt: p.createdAt.toISOString(),
    isEdited: p.isEdited,
  }));

  // ── Leaderboard ──────────────────────────────────────────────
  const tradingUsers = await prisma.user.findMany({
    where: { isActive: true, isAdmin: false },
    include: { account: true, stockHoldings: { include: { company: true } } },
  });

  const leaderboard = await Promise.all(tradingUsers.map(async (u) => {
    const vals = await Promise.all(
      u.stockHoldings.filter(h => Number(h.sharesOwned) > 0).map(async (h) => {
        const price = await getVWAPPrice({
          companyId: h.company.id,
          foundingCost: h.company.foundingCost ? Number(h.company.foundingCost) : null,
          totalSharesIssued: h.company.totalSharesIssued,
          splitMultiplier: Number(h.company.splitMultiplier),
        });
        return Number(h.sharesOwned) * price;
      })
    );
    const stockValue = vals.reduce((s, v) => s + v, 0);
    const cashBalance = Number(u.account?.cashBalance ?? 0);
    return { id: u.id, username: u.username, cashBalance, stockValue, totalValue: cashBalance + stockValue };
  }));
  leaderboard.sort((a, b) => b.totalValue - a.totalValue);

  // ── Per-user portfolios ──────────────────────────────────────
  const portfoliosByUsername = {};
  for (const u of tradingUsers) {
    if (!u.account) continue;
    const holdings = await Promise.all(
      u.stockHoldings.filter(h => Number(h.sharesOwned) > 0).map(async (h) => {
        const currentPrice = await getVWAPPrice({
          companyId: h.company.id,
          foundingCost: h.company.foundingCost ? Number(h.company.foundingCost) : null,
          totalSharesIssued: h.company.totalSharesIssued,
          splitMultiplier: Number(h.company.splitMultiplier),
        });
        return {
          ticker: h.company.tickerSymbol,
          companyName: h.company.companyName,
          sharesOwned: Number(h.sharesOwned),
          reservedShares: Number(h.reservedShares),
          availableShares: Number(h.sharesOwned) - Number(h.reservedShares),
          totalSharesIssued: Number(h.company.totalSharesIssued),
          currentPrice,
          positionValue: Number(h.sharesOwned) * currentPrice,
        };
      })
    );
    const stockValue = holdings.reduce((s, h) => s + h.positionValue, 0);
    const cashBalance = Number(u.account.cashBalance);
    const reservedCash = Number(u.account.reservedCash);
    portfoliosByUsername[u.username] = {
      id: u.id,
      username: u.username,
      cashBalance,
      reservedCash,
      availableCash: cashBalance - reservedCash,
      stockValue,
      totalValue: cashBalance + stockValue,
      holdings,
      createdAt: u.createdAt.toISOString(),
    };
  }

  // ── Portfolio histories ──────────────────────────────────────
  const portfolioHistoryByUsername = {};
  for (const u of tradingUsers) {
    const txs = await prisma.transaction.findMany({
      where: { OR: [{ buyerId: u.id }, { sellerId: u.id }] },
      include: { company: true },
      orderBy: { timestamp: 'asc' },
      take: 500,
    });
    const STARTING = 100000;
    let cash = STARTING;
    const hld = {};
    const prices = {};
    const hist = [{ timestamp: u.createdAt.toISOString(), value: STARTING }];
    for (const tx of txs) {
      const amount = Number(tx.totalAmount);
      const shares = Number(tx.sharesTraded);
      const cid = tx.companyId;
      prices[cid] = Number(tx.pricePerShare);
      if (tx.buyerId === u.id) { cash -= amount; hld[cid] = (hld[cid] || 0) + shares; }
      else { cash += amount; hld[cid] = (hld[cid] || 0) - shares; }
      const sv = Object.entries(hld).reduce((s, [id, sh]) => s + sh * (prices[id] || 0), 0);
      hist.push({ timestamp: tx.timestamp.toISOString(), value: cash + sv });
    }
    const port = portfoliosByUsername[u.username];
    if (port) hist.push({ timestamp: new Date().toISOString(), value: port.totalValue });
    portfolioHistoryByUsername[u.username] = hist;
  }

  // ── Admin logs ───────────────────────────────────────────────
  const rawLogs = await prisma.llmActivityLog.findMany({
    orderBy: { timestamp: 'desc' },
    take: 100,
    include: { user: { select: { username: true } } },
  });
  const adminLogs = rawLogs.map(l => ({
    logId: l.id,
    userId: l.userId,
    username: l.user.username,
    actionType: l.actionType,
    actionDetails: l.actionDetails ?? {},
    result: l.result ?? {},
    timestamp: l.timestamp.toISOString(),
  }));

  // ── Bot logs (empty — bots idle in demo) ─────────────────────
  const botLogs = [];

  // ── Assemble ─────────────────────────────────────────────────
  const output = {
    _meta: {
      snapshotAt: new Date().toISOString(),
      note: 'Static demo snapshot — no passwords, secrets, or PII included',
    },
    companies,
    leaderboard,
    orderBook,
    adminOrders,
    transactions,
    posts,
    portfoliosByUsername,
    portfolioHistoryByUsername,
    adminLogs,
    botLogs,
    botStatus: {
      loopRunning: false,
      activeBotsCount: 0,
      executionInterval: 30000,
      currentBot: null,
      queue: [],
      lastCycleStart: null,
      lastCycleEnd: null,
      isExecuting: false,
    },
  };

  process.stdout.write(JSON.stringify(output, null, 2));
  process.stderr.write(`\n✓ Snapshot complete: ${companies.length} companies, ${leaderboard.length} operators, ${transactions.length} tx, ${posts.length} posts, ${adminLogs.length} logs\n`);
}

main()
  .catch(e => { process.stderr.write(String(e) + '\n'); process.exit(1); })
  .finally(() => prisma.$disconnect());
