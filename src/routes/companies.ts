import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

const router = Router();

// Found a new company
router.post('/found', async (req: Request, res: Response) => {
  try {
    const { userId, tickerSymbol, companyName, investmentAmount, totalShares } = req.body;

    if (!userId || !tickerSymbol || !companyName || !investmentAmount || !totalShares) {
      return res.status(400).json({
        error: 'userId, tickerSymbol, companyName, investmentAmount, and totalShares are required',
      });
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

    // Check if user already founded a company
    const existingCompany = await prisma.company.findUnique({
      where: { foundedByUserId: userId },
    });

    if (existingCompany) {
      return res.status(400).json({ error: 'You can only found one company' });
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
          tickerSymbol: tickerSymbol.toUpperCase(),
          companyName,
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
    console.error(error);
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
      const currentPrice = lastTransaction
        ? Number(lastTransaction.pricePerShare)
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
    console.error(error);
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
    const currentPrice = lastTransaction
      ? Number(lastTransaction.pricePerShare)
      : Number(company.foundingCost) / Number(company.totalSharesIssued);

    return res.json({
      ticker: company.tickerSymbol,
      companyName: company.companyName,
      currentPrice,
      lastTradeTime: lastTransaction?.timestamp || null,
      totalSharesIssued: company.totalSharesIssued.toString(),
      foundedBy: company.founder?.username || null,
      recentTransactions: company.transactions.map(t => ({
        price: Number(t.pricePerShare),
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
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch company' });
  }
});

export default router;
