import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { sanitizeString, validateTicker } from '../lib/utils';
import { logger } from '../lib/logger';

const router = Router();

// Found a new company
router.post('/found', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId; // Use authenticated user ID
    const { tickerSymbol, companyName, investmentAmount, totalShares } = req.body;

    if (!tickerSymbol || !companyName || !investmentAmount || !totalShares) {
      return res.status(400).json({
        error: 'tickerSymbol, companyName, investmentAmount, and totalShares are required',
      });
    }

    // Validate and sanitize ticker
    const tickerValidation = validateTicker(tickerSymbol);
    if (!tickerValidation.valid) {
      return res.status(400).json({ error: tickerValidation.error });
    }
    const sanitizedTicker = tickerSymbol.toUpperCase().trim();

    // Sanitize company name
    const sanitizedCompanyName = sanitizeString(companyName, 100);
    if (sanitizedCompanyName.length === 0) {
      return res.status(400).json({ error: 'Company name cannot be empty' });
    }

    const investment = parseFloat(investmentAmount);
    const shares = BigInt(totalShares);

    if (investment <= 0 || shares <= 0) {
      return res.status(400).json({ error: 'Investment and shares must be positive' });
    }

    // Get user with account
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { account: true },
    });

    if (!user || !user.account) {
      return res.status(401).json({ error: 'Please log in to found a company' });
    }

    const availableCash = Number(user.account.cashBalance) - Number(user.account.reservedCash);
    if (investment > availableCash) {
      return res.status(400).json({
        error: `Insufficient funds. Need $${investment}, have $${availableCash} available.`,
      });
    }

    // Create company and update holdings in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Deduct cash from user
      await tx.account.update({
        where: { userId },
        data: {
          cashBalance: { decrement: investment },
        },
      });

      // Create company
      const company = await tx.company.create({
        data: {
          tickerSymbol: sanitizedTicker,
          companyName: sanitizedCompanyName,
          foundedByUserId: userId,
          foundingCost: investment,
          totalSharesIssued: shares,
        },
      });

      // Give founder all shares
      await tx.stockHolding.create({
        data: {
          userId,
          companyId: company.id,
          sharesOwned: shares,
          reservedShares: 0,
        },
      });

      return company;
    });

    const pricePerShare = investment / Number(shares);

    return res.status(201).json({
      success: true,
      company: {
        id: result.id,
        ticker: result.tickerSymbol,
        name: result.companyName,
        totalShares: result.totalSharesIssued.toString(),
        pricePerShare,
        foundingCost: result.foundingCost,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'Ticker symbol already exists' });
      }
    }
    logger.error('Error in companies route', error);
    return res.status(500).json({ error: 'Failed to found company' });
  }
});

// Get all companies
router.get('/', async (_req: Request, res: Response) => {
  try {
    const companies = await prisma.company.findMany({
      include: {
        founder: {
          select: { username: true },
        },
        transactions: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
    });

    const result = companies.map(c => {
      const lastTransaction = c.transactions[0];
      // Price adjusted for splits: transactionPrice * (company.splitMultiplier / transaction.splitMultiplier)
      const currentPrice = lastTransaction
        ? Number(lastTransaction.pricePerShare) * (Number(c.splitMultiplier) / Number(lastTransaction.splitMultiplier))
        : Number(c.foundingCost) / Number(c.totalSharesIssued);

      return {
        ticker: c.tickerSymbol,
        companyName: c.companyName,
        currentPrice,
        totalSharesIssued: c.totalSharesIssued.toString(),
        foundedBy: c.founder?.username || null,
        createdAt: c.createdAt,
      };
    });

    return res.json(result);
  } catch (error) {
    logger.error('Error in companies route', error);
    return res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// Get company by ticker
router.get('/:ticker', async (req: Request<{ ticker: string }>, res: Response) => {
  try {
    const ticker = req.params.ticker.toUpperCase();

    const company = await prisma.company.findUnique({
      where: { tickerSymbol: ticker },
      include: {
        founder: {
          select: { username: true },
        },
        transactions: {
          orderBy: { timestamp: 'desc' },
          take: 10,
          include: {
            buyer: { select: { username: true } },
            seller: { select: { username: true } },
          },
        },
        stockHoldings: {
          include: {
            user: { select: { username: true } },
          },
        },
      },
    });

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const lastTransaction = company.transactions[0];
    // Price adjusted for splits: transactionPrice * (company.splitMultiplier / transaction.splitMultiplier)
    const currentPrice = lastTransaction
      ? Number(lastTransaction.pricePerShare) * (Number(company.splitMultiplier) / Number(lastTransaction.splitMultiplier))
      : Number(company.foundingCost) / Number(company.totalSharesIssued);

    // Also include split-adjusted prices for recent transactions
    const companySplitMultiplier = Number(company.splitMultiplier);

    return res.json({
      ticker: company.tickerSymbol,
      companyName: company.companyName,
      currentPrice,
      lastTradeTime: lastTransaction?.timestamp || null,
      totalSharesIssued: company.totalSharesIssued.toString(),
      foundedBy: company.founder?.username || null,
      splitMultiplier: companySplitMultiplier,
      recentTransactions: company.transactions.map(t => ({
        price: Number(t.pricePerShare) * (companySplitMultiplier / Number(t.splitMultiplier)),
        shares: t.sharesTraded.toString(),
        buyer: t.buyer.username,
        seller: t.seller.username,
        timestamp: t.timestamp,
      })),
      shareholders: company.stockHoldings
        .filter(h => Number(h.sharesOwned) > 0)
        .map(h => ({
          username: h.user.username,
          shares: h.sharesOwned.toString(),
        })),
    });
  } catch (error) {
    logger.error('Error in companies route', error);
    return res.status(500).json({ error: 'Failed to fetch company' });
  }
});

// Stock split - only available to majority shareholder
router.post('/:ticker/split', authenticate, async (req: Request<{ ticker: string }>, res: Response) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const userId = req.user!.userId; // Use authenticated user ID

    const company = await prisma.company.findUnique({
      where: { tickerSymbol: ticker },
      include: {
        stockHoldings: true,
      },
    });

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Check if user is majority shareholder (> 50% of shares)
    const userHolding = company.stockHoldings.find(h => h.userId === userId);
    if (!userHolding) {
      return res.status(403).json({ error: 'You do not own any shares of this company' });
    }

    const userShares = Number(userHolding.sharesOwned);
    const totalShares = Number(company.totalSharesIssued);
    const ownershipPercent = (userShares / totalShares) * 100;

    if (ownershipPercent <= 50) {
      return res.status(403).json({
        error: `Only the majority shareholder can split the stock. You own ${ownershipPercent.toFixed(1)}% (need >50%)`,
      });
    }

    // Check if stock price after split would be below minimum (0.01)
    // A 2:1 split halves the price, so we need currentPrice > 0.02 to ensure post-split price > 0.01
    const lastTransaction = await prisma.transaction.findFirst({
      where: { companyId: company.id },
      orderBy: { timestamp: 'desc' },
    });

    const currentPrice = lastTransaction
      ? Number(lastTransaction.pricePerShare) * (Number(company.splitMultiplier) / Number(lastTransaction.splitMultiplier))
      : Number(company.foundingCost) / Number(company.totalSharesIssued);

    const priceAfterSplit = currentPrice / 2;

    // Use epsilon to handle floating point precision issues
    const MINIMUM_PRICE = 0.01;
    const EPSILON = 0.0001;

    if (priceAfterSplit < MINIMUM_PRICE + EPSILON) {
      logger.debug('Stock split blocked - price would be below minimum', { ticker, currentPrice, priceAfterSplit });
      return res.status(400).json({
        error: `Cannot split stock.`,
      });
    }

    // Perform the split in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Double all stockholdings for this company
      await tx.stockHolding.updateMany({
        where: { companyId: company.id },
        data: {
          sharesOwned: { multiply: 2 },
          reservedShares: { multiply: 2 },
        },
      });

      // Double total shares and halve the split multiplier
      const newSplitMultiplier = Number(company.splitMultiplier) * 0.5;
      const updatedCompany = await tx.company.update({
        where: { id: company.id },
        data: {
          totalSharesIssued: { multiply: 2 },
          splitMultiplier: newSplitMultiplier,
        },
      });

      // Update open bids: double shares requested, halve price per share (total cost stays same)
      await tx.bid.updateMany({
        where: { companyId: company.id, status: 'open' },
        data: {
          sharesRequested: { multiply: 2 },
          pricePerShare: { divide: 2 },
        },
      });

      // Update open asks: double shares offered, halve price per share
      await tx.ask.updateMany({
        where: { companyId: company.id, status: 'open' },
        data: {
          sharesOffered: { multiply: 2 },
          pricePerShare: { divide: 2 },
        },
      });

      return updatedCompany;
    });

    return res.json({
      success: true,
      message: `Stock split successful! All shares have been doubled.`,
      ticker: result.tickerSymbol,
      newTotalShares: result.totalSharesIssued.toString(),
      splitMultiplier: Number(result.splitMultiplier),
    });
  } catch (error) {
    logger.error('Error in companies route', error);
    return res.status(500).json({ error: 'Failed to split stock' });
  }
});

export default router;
