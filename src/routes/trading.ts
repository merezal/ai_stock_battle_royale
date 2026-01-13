import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();

// Apply authentication to all trading routes
router.use(authenticate);

// Place a bid (buy order)
router.post('/bids', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId; // Use authenticated user ID
    const { ticker, shares, pricePerShare } = req.body;

    if (!ticker || !shares || !pricePerShare) {
      return res.status(400).json({
        error: 'ticker, shares, and pricePerShare are required',
      });
    }

    const shareCount = BigInt(shares);
    const price = parseFloat(pricePerShare);
    const totalCost = Number(shareCount) * price;

    if (shareCount <= 0 || price <= 0) {
      return res.status(400).json({ error: 'Shares and price must be positive' });
    }

    if (price < 0.01) {
      return res.status(400).json({ error: 'Price per share must be at least $0.01' });
    }

    // Get user and company
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

    // Check if user already has 5 open bids
    const openBidsCount = await prisma.bid.count({
      where: { userId, status: 'open' },
    });

    if (openBidsCount >= 5) {
      return res.status(400).json({
        error: 'You already have 5 open bids. Cancel or wait for fulfillment before placing more.',
      });
    }

    // Check 30-minute cooldown on manual trades
    if (user.account.lastManualTradeAt) {
      const timeSinceLastTrade = Date.now() - user.account.lastManualTradeAt.getTime();
      const cooldownMs = 30 * 60 * 1000; // 30 minutes in milliseconds

      if (timeSinceLastTrade < cooldownMs) {
        const remainingMs = cooldownMs - timeSinceLastTrade;
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        return res.status(429).json({
          error: `Manual trade cooldown active. Please wait ${remainingMinutes} more minute(s) before placing another order.`,
          cooldownRemainingMs: remainingMs,
        });
      }
    }

    const availableCash = Number(user.account.cashBalance) - Number(user.account.reservedCash);
    if (totalCost > availableCash) {
      return res.status(400).json({
        error: `Insufficient funds. Need $${totalCost}, have $${availableCash} available.`,
      });
    }

    // Create bid and reserve cash
    const bid = await prisma.$transaction(async (tx) => {
      // Reserve cash and update last manual trade timestamp
      await tx.account.update({
        where: { userId },
        data: {
          reservedCash: { increment: totalCost },
          lastManualTradeAt: new Date(),
        },
      });

      // Create bid
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

    return res.status(201).json({
      success: true,
      bidId: bid.id,
      totalCost,
      remainingAvailableCash: availableCash - totalCost,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to place bid' });
  }
});

// Place an ask (sell order)
router.post('/asks', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId; // Use authenticated user ID
    const { ticker, shares, pricePerShare } = req.body;

    if (!ticker || !shares || !pricePerShare) {
      return res.status(400).json({
        error: 'ticker, shares, and pricePerShare are required',
      });
    }

    const shareCount = BigInt(shares);
    const price = parseFloat(pricePerShare);

    if (shareCount <= 0 || price <= 0) {
      return res.status(400).json({ error: 'Shares and price must be positive' });
    }

    if (price < 0.01) {
      return res.status(400).json({ error: 'Price per share must be at least $0.01' });
    }

    // Get company and user account
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

    // Check if user already has 5 open asks
    const openAsksCount = await prisma.ask.count({
      where: { userId, status: 'open' },
    });

    if (openAsksCount >= 5) {
      return res.status(400).json({
        error: 'You already have 5 open asks. Cancel or wait for fulfillment before placing more.',
      });
    }

    // Check 30-minute cooldown on manual trades
    if (user.account.lastManualTradeAt) {
      const timeSinceLastTrade = Date.now() - user.account.lastManualTradeAt.getTime();
      const cooldownMs = 30 * 60 * 1000; // 30 minutes in milliseconds

      if (timeSinceLastTrade < cooldownMs) {
        const remainingMs = cooldownMs - timeSinceLastTrade;
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        return res.status(429).json({
          error: `Manual trade cooldown active. Please wait ${remainingMinutes} more minute(s) before placing another order.`,
          cooldownRemainingMs: remainingMs,
        });
      }
    }

    // Get user's holding
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

    // Create ask and reserve shares
    const ask = await prisma.$transaction(async (tx) => {
      // Reserve shares
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

      // Update last manual trade timestamp
      await tx.account.update({
        where: { userId },
        data: {
          lastManualTradeAt: new Date(),
        },
      });

      // Create ask
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

    return res.status(201).json({
      success: true,
      askId: ask.id,
      sharesReserved: shareCount.toString(),
      remainingAvailableShares: availableShares - Number(shareCount),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to place ask' });
  }
});

// Fulfill a bid (sell to the bidder)
router.post('/bids/:bidId/fulfill', async (req: Request<{ bidId: string }>, res: Response) => {
  try {
    const bidId = parseInt(req.params.bidId);
    const sellerId = req.user!.userId; // Use authenticated user as seller

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

    // Check fulfiller has enough shares
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

    // Execute transaction
    const transaction = await prisma.$transaction(async (tx) => {
      // Deduct shares from seller
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

      // Delete holding if shares reached 0
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

      // Add shares to buyer (create or update holding)
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

      // Deduct reserved cash and cash balance from buyer
      await tx.account.update({
        where: { userId: bid.userId },
        data: {
          cashBalance: { decrement: Number(bid.totalCost) },
          reservedCash: { decrement: Number(bid.totalCost) },
        },
      });

      // Add cash to seller
      await tx.account.update({
        where: { userId: sellerId },
        data: {
          cashBalance: { increment: Number(bid.totalCost) },
        },
      });

      // Mark bid as fulfilled
      await tx.bid.update({
        where: { id: bidId },
        data: { status: 'fulfilled' },
      });

      // Get company's current split multiplier
      const company = await tx.company.findUnique({
        where: { id: bid.companyId },
        select: { splitMultiplier: true },
      });

      // Create transaction record
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

    return res.json({
      success: true,
      transactionId: transaction.id,
      sharesSold: transaction.sharesTraded.toString(),
      pricePerShare: Number(transaction.pricePerShare),
      cashReceived: Number(transaction.totalAmount),
      buyer: transaction.buyer.username,
      newStockPrice: Number(transaction.pricePerShare),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fulfill bid' });
  }
});

// Fulfill an ask (buy from the asker)
router.post('/asks/:askId/fulfill', async (req: Request<{ askId: string }>, res: Response) => {
  try {
    const askId = parseInt(req.params.askId);
    const buyerId = req.user!.userId; // Use authenticated user as buyer

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

    const totalCost = Number(ask.sharesOffered) * Number(ask.pricePerShare);

    // Check fulfiller has enough cash
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

    // Execute transaction
    const transaction = await prisma.$transaction(async (tx) => {
      // Deduct shares from seller (both owned and reserved)
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

      // Delete holding if shares reached 0
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

      // Add shares to buyer (create or update holding)
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

      // Deduct cash from buyer
      await tx.account.update({
        where: { userId: buyerId },
        data: {
          cashBalance: { decrement: totalCost },
        },
      });

      // Add cash to seller
      await tx.account.update({
        where: { userId: ask.userId },
        data: {
          cashBalance: { increment: totalCost },
        },
      });

      // Mark ask as fulfilled
      await tx.ask.update({
        where: { id: askId },
        data: { status: 'fulfilled' },
      });

      // Get company's current split multiplier
      const company = await tx.company.findUnique({
        where: { id: ask.companyId },
        select: { splitMultiplier: true },
      });

      // Create transaction record
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

    return res.json({
      success: true,
      transactionId: transaction.id,
      sharesBought: transaction.sharesTraded.toString(),
      pricePerShare: Number(transaction.pricePerShare),
      cashSpent: Number(transaction.totalAmount),
      seller: transaction.seller.username,
      newStockPrice: Number(transaction.pricePerShare),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fulfill ask' });
  }
});

// Cancel a bid
router.post('/bids/:bidId/cancel', async (req: Request<{ bidId: string }>, res: Response) => {
  try {
    const bidId = parseInt(req.params.bidId);
    const userId = req.user!.userId; // Use authenticated user

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
      // Unreserve cash
      await tx.account.update({
        where: { userId },
        data: {
          reservedCash: { decrement: Number(bid.totalCost) },
        },
      });

      // Mark bid as cancelled
      await tx.bid.update({
        where: { id: bidId },
        data: { status: 'cancelled' },
      });
    });

    const account = await prisma.account.findUnique({
      where: { userId },
    });

    return res.json({
      success: true,
      cashUnreserved: Number(bid.totalCost),
      newAvailableCash: account
        ? Number(account.cashBalance) - Number(account.reservedCash)
        : 0,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to cancel bid' });
  }
});

// Cancel an ask
router.post('/asks/:askId/cancel', async (req: Request<{ askId: string }>, res: Response) => {
  try {
    const askId = parseInt(req.params.askId);
    const userId = req.user!.userId; // Use authenticated user

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
      // Unreserve shares
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

      // Mark ask as cancelled
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

    return res.json({
      success: true,
      sharesUnreserved: ask.sharesOffered.toString(),
      newAvailableShares: holding
        ? Number(holding.sharesOwned) - Number(holding.reservedShares)
        : 0,
    });
  } catch (error) {
    console.error(error);
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
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch order book' });
  }
});

// Get transaction history
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const ticker = req.query.ticker as string | undefined;
    const username = req.query.username as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

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
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

export default router;
