import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { sanitizeString, validateTicker, validateMinimumPrice, floorToCents } from '../lib/utils';
import { getVWAPPrice } from '../lib/pricing';
import { logger } from '../lib/logger';

const router = Router();

// Found a new company
router.post('/found', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { tickerSymbol, companyName, investmentAmount, totalShares } = req.body;

    if (!tickerSymbol || !companyName || investmentAmount === undefined || totalShares === undefined) {
      return res.status(400).json({
        error: 'tickerSymbol, companyName, investmentAmount, and totalShares are required',
      });
    }

    const tickerValidation = validateTicker(tickerSymbol);
    if (!tickerValidation.valid) {
      return res.status(400).json({ error: tickerValidation.error });
    }
    const sanitizedTicker = tickerSymbol.toUpperCase().trim();

    const sanitizedCompanyName = sanitizeString(companyName, 100);
    if (sanitizedCompanyName.length === 0) {
      return res.status(400).json({ error: 'Company name cannot be empty' });
    }

    const investmentRaw = parseFloat(investmentAmount);
    if (isNaN(investmentRaw) || investmentRaw <= 0) {
      return res.status(400).json({ error: 'investmentAmount must be a positive number' });
    }
    const investment = floorToCents(investmentRaw);

    const sharesNum = Number(totalShares);
    if (!Number.isInteger(sharesNum) || sharesNum <= 0) {
      return res.status(400).json({ error: 'totalShares must be a positive integer' });
    }
    const shares = BigInt(sharesNum);

    const pricePerShare = floorToCents(investment / sharesNum);
    if (!validateMinimumPrice(pricePerShare)) {
      return res.status(400).json({ error: 'Price per share must be at least $0.01' });
    }

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

    const result = await prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { userId },
        data: {
          cashBalance: { decrement: investment },
        },
      });

      const company = await tx.company.create({
        data: {
          tickerSymbol: sanitizedTicker,
          companyName: sanitizedCompanyName,
          foundedByUserId: userId,
          foundingCost: investment,
          totalSharesIssued: shares,
        },
      });

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

    return res.status(201).json({
      success: true,
      company: {
        id: result.id,
        ticker: result.tickerSymbol,
        name: result.companyName,
        totalShares: result.totalSharesIssued.toString(),
        pricePerShare,
        foundingCost: Number(result.foundingCost),
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
      },
    });

    const result = await Promise.all(
      companies.map(async (c) => {
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
          totalSharesIssued: c.totalSharesIssued.toString(),
          foundedBy: c.founder?.username || null,
          createdAt: c.createdAt,
        };
      })
    );

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

    const companySplitMultiplier = Number(company.splitMultiplier);
    const currentPrice = await getVWAPPrice({
      companyId: company.id,
      foundingCost: company.foundingCost ? Number(company.foundingCost) : null,
      totalSharesIssued: company.totalSharesIssued,
      splitMultiplier: companySplitMultiplier,
    });

    const lastTransaction = company.transactions[0];

    // Founding price adjusted for splits, floored to cents
    const foundingPrice = company.foundingCost
      ? floorToCents(Number(company.foundingCost) / (Number(company.totalSharesIssued) * companySplitMultiplier))
      : null;

    return res.json({
      ticker: company.tickerSymbol,
      companyName: company.companyName,
      currentPrice,
      foundingPrice,
      foundedAt: company.createdAt,
      lastTradeTime: lastTransaction?.timestamp || null,
      totalSharesIssued: company.totalSharesIssued.toString(),
      foundedBy: company.founder?.username || null,
      splitMultiplier: companySplitMultiplier,
      recentTransactions: company.transactions.map(t => ({
        // Adjust historical price to current split level, floored to cents
        price: floorToCents(Number(t.pricePerShare) * (companySplitMultiplier / Number(t.splitMultiplier))),
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
    const userId = req.user!.userId;

    const company = await prisma.company.findUnique({
      where: { tickerSymbol: ticker },
      include: {
        stockHoldings: true,
      },
    });

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

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

    const currentPrice = await getVWAPPrice({
      companyId: company.id,
      foundingCost: company.foundingCost ? Number(company.foundingCost) : null,
      totalSharesIssued: company.totalSharesIssued,
      splitMultiplier: Number(company.splitMultiplier),
    });

    // Floor the post-split price to see what buyers will actually pay after rounding
    const priceAfterSplit = floorToCents(currentPrice / 2);

    if (priceAfterSplit < 0.01) {
      logger.debug('Stock split blocked - price would be below minimum', { ticker, currentPrice, priceAfterSplit });
      return res.status(400).json({
        error: `Cannot split stock. Post-split price ($${priceAfterSplit}) would be below the $0.01 minimum.`,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Double all stockholdings
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

      // Double shares on open bids; floor the halved price using TRUNC in SQL.
      // totalCost on bids is intentionally unchanged (buyer reserves the same cash).
      await tx.$executeRaw`
        UPDATE bids
        SET shares_requested = shares_requested * 2,
            price_per_share  = TRUNC(price_per_share / 2, 2)
        WHERE company_id = ${company.id} AND status = 'open'
      `;

      // Double shares on open asks; floor the halved price using TRUNC in SQL.
      await tx.$executeRaw`
        UPDATE asks
        SET shares_offered = shares_offered * 2,
            price_per_share = TRUNC(price_per_share / 2, 2)
        WHERE company_id = ${company.id} AND status = 'open'
      `;

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
