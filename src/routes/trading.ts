import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { logger } from '../lib/logger';
import { validateMinimumPrice, floorToCents } from '../lib/utils';
import {
  emitOrderbookUpdated,
  emitPortfolioUpdated,
  emitCompaniesUpdated,
  emitLeaderboardUpdated,
  emitTransactionsNew,
} from '../lib/emit';

const router = Router();

const MANUAL_TRADE_COOLDOWN_MS = 30 * 60 * 1000;

function checkManualCooldown(lastManualTradeAt: Date | null): { blocked: true; remainingMs: number } | { blocked: false } {
  if (!lastManualTradeAt) return { blocked: false };
  const elapsed = Date.now() - lastManualTradeAt.getTime();
  if (elapsed < MANUAL_TRADE_COOLDOWN_MS) {
    return { blocked: true, remainingMs: MANUAL_TRADE_COOLDOWN_MS - elapsed };
  }
  return { blocked: false };
}

function parseShares(raw: unknown): { ok: true; value: bigint } | { ok: false; error: string } {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    return { ok: false, error: 'shares must be a positive integer' };
  }
  return { ok: true, value: BigInt(n) };
}

function parsePrice(raw: unknown): { ok: true; value: number } | { ok: false; error: string } {
  const n = parseFloat(String(raw));
  if (isNaN(n) || n <= 0) {
    return { ok: false, error: 'pricePerShare must be a positive number' };
  }
  return { ok: true, value: n };
}

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}

// Apply authentication to all trading routes
router.use(authenticate);

// Place a bid (buy order)
router.post('/bids', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { ticker, shares, pricePerShare } = req.body;

    if (!ticker || shares === undefined || pricePerShare === undefined) {
      return res.status(400).json({
        error: 'ticker, shares, and pricePerShare are required',
      });
    }

    const sharesResult = parseShares(shares);
    if (!sharesResult.ok) return res.status(400).json({ error: sharesResult.error });

    const priceResult = parsePrice(pricePerShare);
    if (!priceResult.ok) return res.status(400).json({ error: priceResult.error });

    const shareCount = sharesResult.value;
    const price = floorToCents(priceResult.value);
    const totalCost = floorToCents(Number(shareCount) * price);

    if (!validateMinimumPrice(price)) {
      return res.status(400).json({ error: 'Price per share must be at least $0.01' });
    }

    const [user, company] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        include: { account: true },
      }),
      prisma.company.findUnique({
        where: { tickerSymbol: ticker.toUpperCase() },
      }),
    ]);

    if (!user || !user.account) {
      return res.status(401).json({ error: 'Please log in to place orders' });
    }

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const openBidsCount = await prisma.bid.count({
      where: { userId, status: 'open' },
    });

    if (openBidsCount >= 5) {
      return res.status(400).json({
        error: 'You already have 5 open bids. Cancel or wait for fulfillment before placing more.',
      });
    }

    const cooldown = checkManualCooldown(user.account.lastManualTradeAt);
    if (cooldown.blocked) {
      const remainingMinutes = Math.ceil(cooldown.remainingMs / 60000);
      return res.status(429).json({
        error: `Manual trade cooldown active. Please wait ${remainingMinutes} more minute(s) before placing another order.`,
        cooldownRemainingMs: cooldown.remainingMs,
      });
    }

    const availableCash = Number(user.account.cashBalance) - Number(user.account.reservedCash);
    if (totalCost > availableCash) {
      return res.status(400).json({
        error: `Insufficient funds. Need $${totalCost}, have $${availableCash} available.`,
      });
    }

    const bid = await prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { userId },
        data: {
          reservedCash: { increment: totalCost },
          lastManualTradeAt: new Date(),
        },
      });

      return tx.bid.create({
        data: {
          userId,
          companyId: company.id,
          sharesRequested: shareCount,
          pricePerShare: price,
          totalCost,
          status: 'open',
        },
      });
    });

    emitOrderbookUpdated(ticker.toUpperCase());
    emitPortfolioUpdated(userId, user.username);

    return res.status(201).json({
      success: true,
      bidId: bid.id,
      totalCost,
      remainingAvailableCash: availableCash - totalCost,
    });
  } catch (error) {
    logger.error('Error in trading route', error);
    return res.status(500).json({ error: 'Failed to place bid' });
  }
});

// Place an ask (sell order)
router.post('/asks', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { ticker, shares, pricePerShare } = req.body;

    if (!ticker || shares === undefined || pricePerShare === undefined) {
      return res.status(400).json({
        error: 'ticker, shares, and pricePerShare are required',
      });
    }

    const sharesResult = parseShares(shares);
    if (!sharesResult.ok) return res.status(400).json({ error: sharesResult.error });

    const priceResult = parsePrice(pricePerShare);
    if (!priceResult.ok) return res.status(400).json({ error: priceResult.error });

    const shareCount = sharesResult.value;
    const price = floorToCents(priceResult.value);

    if (!validateMinimumPrice(price)) {
      return res.status(400).json({ error: 'Price per share must be at least $0.01' });
    }

    const [company, user] = await Promise.all([
      prisma.company.findUnique({
        where: { tickerSymbol: ticker.toUpperCase() },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        include: { account: true },
      }),
    ]);

    if (!user || !user.account) {
      return res.status(401).json({ error: 'Please log in to place orders' });
    }

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const openAsksCount = await prisma.ask.count({
      where: { userId, status: 'open' },
    });

    if (openAsksCount >= 5) {
      return res.status(400).json({
        error: 'You already have 5 open asks. Cancel or wait for fulfillment before placing more.',
      });
    }

    const cooldown = checkManualCooldown(user.account.lastManualTradeAt);
    if (cooldown.blocked) {
      const remainingMinutes = Math.ceil(cooldown.remainingMs / 60000);
      return res.status(429).json({
        error: `Manual trade cooldown active. Please wait ${remainingMinutes} more minute(s) before placing another order.`,
        cooldownRemainingMs: cooldown.remainingMs,
      });
    }

    const holding = await prisma.stockHolding.findUnique({
      where: {
        userId_companyId: {
          userId,
          companyId: company.id,
        },
      },
    });

    if (!holding) {
      return res.status(400).json({ error: 'You do not own any shares of this company' });
    }

    const availableShares = Number(holding.sharesOwned) - Number(holding.reservedShares);
    if (Number(shareCount) > availableShares) {
      return res.status(400).json({
        error: `Insufficient shares. Trying to sell ${shareCount}, only have ${availableShares} available.`,
      });
    }

    const ask = await prisma.$transaction(async (tx) => {
      await tx.stockHolding.update({
        where: {
          userId_companyId: {
            userId,
            companyId: company.id,
          },
        },
        data: {
          reservedShares: { increment: shareCount },
        },
      });

      await tx.account.update({
        where: { userId },
        data: {
          lastManualTradeAt: new Date(),
        },
      });

      return tx.ask.create({
        data: {
          userId,
          companyId: company.id,
          sharesOffered: shareCount,
          pricePerShare: price,
          status: 'open',
        },
      });
    });

    emitOrderbookUpdated(ticker.toUpperCase());
    emitPortfolioUpdated(userId, user.username);

    return res.status(201).json({
      success: true,
      askId: ask.id,
      sharesReserved: shareCount.toString(),
      remainingAvailableShares: availableShares - Number(shareCount),
    });
  } catch (error) {
    logger.error('Error in trading route', error);
    return res.status(500).json({ error: 'Failed to place ask' });
  }
});

// Fulfill a bid (sell to the bidder)
router.post('/bids/:bidId/fulfill', async (req: Request<{ bidId: string }>, res: Response) => {
  try {
    const bidId = parseId(req.params.bidId);
    if (bidId === null) return res.status(400).json({ error: 'Invalid bid ID' });
    const sellerId = req.user!.userId;

    const bid = await prisma.bid.findUnique({
      where: { id: bidId },
      include: { company: true },
    });

    if (!bid) {
      return res.status(404).json({ error: 'Bid not found' });
    }

    if (bid.status !== 'open') {
      return res.status(400).json({ error: 'Bid is no longer open' });
    }

    if (bid.userId === sellerId) {
      return res.status(400).json({ error: 'Cannot fulfill your own bid' });
    }

    const holding = await prisma.stockHolding.findUnique({
      where: {
        userId_companyId: {
          userId: sellerId,
          companyId: bid.companyId,
        },
      },
    });

    const availableShares = holding
      ? Number(holding.sharesOwned) - Number(holding.reservedShares)
      : 0;

    if (Number(bid.sharesRequested) > availableShares) {
      return res.status(400).json({
        error: `You don't own enough shares. Need ${bid.sharesRequested}, have ${availableShares}.`,
      });
    }

    const transaction = await prisma.$transaction(async (tx) => {
      const updatedSellerHolding = await tx.stockHolding.update({
        where: {
          userId_companyId: {
            userId: sellerId,
            companyId: bid.companyId,
          },
        },
        data: {
          sharesOwned: { decrement: bid.sharesRequested },
        },
      });

      if (Number(updatedSellerHolding.sharesOwned) === 0) {
        await tx.stockHolding.delete({
          where: {
            userId_companyId: {
              userId: sellerId,
              companyId: bid.companyId,
            },
          },
        });
      }

      await tx.stockHolding.upsert({
        where: {
          userId_companyId: {
            userId: bid.userId,
            companyId: bid.companyId,
          },
        },
        create: {
          userId: bid.userId,
          companyId: bid.companyId,
          sharesOwned: bid.sharesRequested,
          reservedShares: 0,
        },
        update: {
          sharesOwned: { increment: bid.sharesRequested },
        },
      });

      await tx.account.update({
        where: { userId: bid.userId },
        data: {
          cashBalance: { decrement: Number(bid.totalCost) },
          reservedCash: { decrement: Number(bid.totalCost) },
        },
      });

      await tx.account.update({
        where: { userId: sellerId },
        data: {
          cashBalance: { increment: Number(bid.totalCost) },
        },
      });

      await tx.bid.update({
        where: { id: bidId },
        data: { status: 'fulfilled' },
      });

      const company = await tx.company.findUnique({
        where: { id: bid.companyId },
        select: { splitMultiplier: true },
      });

      return tx.transaction.create({
        data: {
          buyerId: bid.userId,
          sellerId: sellerId,
          companyId: bid.companyId,
          sharesTraded: bid.sharesRequested,
          pricePerShare: bid.pricePerShare,
          totalAmount: bid.totalCost,
          bidId: bid.id,
          transactionType: 'bid_fulfillment',
          splitMultiplier: company?.splitMultiplier ?? 1.0,
        },
        include: {
          buyer: { select: { username: true } },
        },
      });
    });

    const ticker = bid.company.tickerSymbol;
    emitOrderbookUpdated(ticker);
    emitCompaniesUpdated();
    emitTransactionsNew(ticker);
    emitPortfolioUpdated(sellerId, req.user!.username);
    emitPortfolioUpdated(bid.userId, transaction.buyer.username);
    emitLeaderboardUpdated();

    return res.json({
      success: true,
      transactionId: transaction.id,
      sharesSold: transaction.sharesTraded.toString(),
      pricePerShare: Number(transaction.pricePerShare),
      cashReceived: Number(transaction.totalAmount),
      buyer: transaction.buyer.username,
    });
  } catch (error) {
    logger.error('Error in trading route', error);
    return res.status(500).json({ error: 'Failed to fulfill bid' });
  }
});

// Fulfill an ask (buy from the asker)
router.post('/asks/:askId/fulfill', async (req: Request<{ askId: string }>, res: Response) => {
  try {
    const askId = parseId(req.params.askId);
    if (askId === null) return res.status(400).json({ error: 'Invalid ask ID' });
    const buyerId = req.user!.userId;

    const ask = await prisma.ask.findUnique({
      where: { id: askId },
      include: { company: true },
    });

    if (!ask) {
      return res.status(404).json({ error: 'Ask not found' });
    }

    if (ask.status !== 'open') {
      return res.status(400).json({ error: 'Ask is no longer open' });
    }

    if (ask.userId === buyerId) {
      return res.status(400).json({ error: 'Cannot fulfill your own ask' });
    }

    const totalCost = floorToCents(Number(ask.sharesOffered) * Number(ask.pricePerShare));

    const account = await prisma.account.findUnique({
      where: { userId: buyerId },
    });

    if (!account) {
      return res.status(404).json({ error: 'User not found' });
    }

    const availableCash = Number(account.cashBalance) - Number(account.reservedCash);
    if (totalCost > availableCash) {
      return res.status(400).json({
        error: `Insufficient funds. Need $${totalCost}, have $${availableCash} available.`,
      });
    }

    const transaction = await prisma.$transaction(async (tx) => {
      const updatedSellerHolding = await tx.stockHolding.update({
        where: {
          userId_companyId: {
            userId: ask.userId,
            companyId: ask.companyId,
          },
        },
        data: {
          sharesOwned: { decrement: ask.sharesOffered },
          reservedShares: { decrement: ask.sharesOffered },
        },
      });

      if (Number(updatedSellerHolding.sharesOwned) === 0) {
        await tx.stockHolding.delete({
          where: {
            userId_companyId: {
              userId: ask.userId,
              companyId: ask.companyId,
            },
          },
        });
      }

      await tx.stockHolding.upsert({
        where: {
          userId_companyId: {
            userId: buyerId,
            companyId: ask.companyId,
          },
        },
        create: {
          userId: buyerId,
          companyId: ask.companyId,
          sharesOwned: ask.sharesOffered,
          reservedShares: 0,
        },
        update: {
          sharesOwned: { increment: ask.sharesOffered },
        },
      });

      await tx.account.update({
        where: { userId: buyerId },
        data: {
          cashBalance: { decrement: totalCost },
        },
      });

      await tx.account.update({
        where: { userId: ask.userId },
        data: {
          cashBalance: { increment: totalCost },
        },
      });

      await tx.ask.update({
        where: { id: askId },
        data: { status: 'fulfilled' },
      });

      const company = await tx.company.findUnique({
        where: { id: ask.companyId },
        select: { splitMultiplier: true },
      });

      return tx.transaction.create({
        data: {
          buyerId: buyerId,
          sellerId: ask.userId,
          companyId: ask.companyId,
          sharesTraded: ask.sharesOffered,
          pricePerShare: ask.pricePerShare,
          totalAmount: totalCost,
          askId: ask.id,
          transactionType: 'ask_fulfillment',
          splitMultiplier: company?.splitMultiplier ?? 1.0,
        },
        include: {
          seller: { select: { username: true } },
        },
      });
    });

    const ticker = ask.company.tickerSymbol;
    emitOrderbookUpdated(ticker);
    emitCompaniesUpdated();
    emitTransactionsNew(ticker);
    emitPortfolioUpdated(buyerId, req.user!.username);
    emitPortfolioUpdated(ask.userId, transaction.seller.username);
    emitLeaderboardUpdated();

    return res.json({
      success: true,
      transactionId: transaction.id,
      sharesBought: transaction.sharesTraded.toString(),
      pricePerShare: Number(transaction.pricePerShare),
      cashSpent: Number(transaction.totalAmount),
      seller: transaction.seller.username,
    });
  } catch (error) {
    logger.error('Error in trading route', error);
    return res.status(500).json({ error: 'Failed to fulfill ask' });
  }
});

// Cancel a bid
router.post('/bids/:bidId/cancel', async (req: Request<{ bidId: string }>, res: Response) => {
  try {
    const bidId = parseId(req.params.bidId);
    if (bidId === null) return res.status(400).json({ error: 'Invalid bid ID' });
    const userId = req.user!.userId;

    const bid = await prisma.bid.findUnique({
      where: { id: bidId },
    });

    if (!bid) {
      return res.status(404).json({ error: 'Bid not found' });
    }

    if (bid.status !== 'open') {
      return res.status(400).json({ error: 'Bid is no longer open' });
    }

    if (bid.userId !== userId) {
      return res.status(403).json({ error: 'You can only cancel your own bids' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { userId },
        data: {
          reservedCash: { decrement: Number(bid.totalCost) },
        },
      });

      await tx.bid.update({
        where: { id: bidId },
        data: { status: 'cancelled' },
      });
    });

    const account = await prisma.account.findUnique({
      where: { userId },
    });

    emitOrderbookUpdated();
    emitPortfolioUpdated(userId, req.user!.username);

    return res.json({
      success: true,
      cashUnreserved: Number(bid.totalCost),
      newAvailableCash: account
        ? Number(account.cashBalance) - Number(account.reservedCash)
        : 0,
    });
  } catch (error) {
    logger.error('Error in trading route', error);
    return res.status(500).json({ error: 'Failed to cancel bid' });
  }
});

// Cancel an ask
router.post('/asks/:askId/cancel', async (req: Request<{ askId: string }>, res: Response) => {
  try {
    const askId = parseId(req.params.askId);
    if (askId === null) return res.status(400).json({ error: 'Invalid ask ID' });
    const userId = req.user!.userId;

    const ask = await prisma.ask.findUnique({
      where: { id: askId },
    });

    if (!ask) {
      return res.status(404).json({ error: 'Ask not found' });
    }

    if (ask.status !== 'open') {
      return res.status(400).json({ error: 'Ask is no longer open' });
    }

    if (ask.userId !== userId) {
      return res.status(403).json({ error: 'You can only cancel your own asks' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.stockHolding.update({
        where: {
          userId_companyId: {
            userId,
            companyId: ask.companyId,
          },
        },
        data: {
          reservedShares: { decrement: ask.sharesOffered },
        },
      });

      await tx.ask.update({
        where: { id: askId },
        data: { status: 'cancelled' },
      });
    });

    const holding = await prisma.stockHolding.findUnique({
      where: {
        userId_companyId: {
          userId,
          companyId: ask.companyId,
        },
      },
    });

    emitOrderbookUpdated();
    emitPortfolioUpdated(userId, req.user!.username);

    return res.json({
      success: true,
      sharesUnreserved: ask.sharesOffered.toString(),
      newAvailableShares: holding
        ? Number(holding.sharesOwned) - Number(holding.reservedShares)
        : 0,
    });
  } catch (error) {
    logger.error('Error in trading route', error);
    return res.status(500).json({ error: 'Failed to cancel ask' });
  }
});

// Get order book (open bids and asks)
router.get('/orderbook', async (req: Request, res: Response) => {
  try {
    const ticker = req.query.ticker as string | undefined;

    const whereClause = ticker
      ? { company: { tickerSymbol: ticker.toUpperCase() } }
      : {};

    const [bids, asks] = await Promise.all([
      prisma.bid.findMany({
        where: { ...whereClause, status: 'open' },
        include: {
          user: { select: { username: true } },
          company: { select: { tickerSymbol: true } },
        },
        orderBy: { pricePerShare: 'desc' },
      }),
      prisma.ask.findMany({
        where: { ...whereClause, status: 'open' },
        include: {
          user: { select: { username: true } },
          company: { select: { tickerSymbol: true } },
        },
        orderBy: { pricePerShare: 'asc' },
      }),
    ]);

    return res.json({
      bids: bids.map(b => ({
        bidId: b.id,
        username: b.user.username,
        ticker: b.company.tickerSymbol,
        shares: b.sharesRequested.toString(),
        pricePerShare: Number(b.pricePerShare),
        totalCost: Number(b.totalCost),
        createdAt: b.createdAt,
      })),
      asks: asks.map(a => ({
        askId: a.id,
        username: a.user.username,
        ticker: a.company.tickerSymbol,
        shares: a.sharesOffered.toString(),
        pricePerShare: Number(a.pricePerShare),
        createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    logger.error('Error in trading route', error);
    return res.status(500).json({ error: 'Failed to fetch order book' });
  }
});

// Get transaction history
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const ticker = req.query.ticker as string | undefined;
    const username = req.query.username as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const whereClause: Record<string, unknown> = {};

    if (ticker) {
      whereClause.company = { tickerSymbol: ticker.toUpperCase() };
    }

    if (username) {
      const user = await prisma.user.findUnique({
        where: { username },
      });
      if (user) {
        whereClause.OR = [{ buyerId: user.id }, { sellerId: user.id }];
      }
    }

    const transactions = await prisma.transaction.findMany({
      where: whereClause,
      include: {
        buyer: { select: { username: true } },
        seller: { select: { username: true } },
        company: { select: { tickerSymbol: true } },
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return res.json(
      transactions.map(t => ({
        transactionId: t.id,
        buyer: t.buyer.username,
        seller: t.seller.username,
        ticker: t.company.tickerSymbol,
        shares: t.sharesTraded.toString(),
        pricePerShare: Number(t.pricePerShare),
        totalAmount: Number(t.totalAmount),
        timestamp: t.timestamp,
      }))
    );
  } catch (error) {
    logger.error('Error in trading route', error);
    return res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

export default router;
