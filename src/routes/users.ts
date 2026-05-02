import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { hashPassword, verifyPassword, generateToken, validatePassword } from '../lib/auth';
import { authenticate } from '../middleware/auth';
import { validateUsername } from '../lib/utils';
import { getVWAPPrice } from '../lib/pricing';
import { logger } from '../lib/logger';

const router = Router();

type StockHoldingWithCompany = {
  sharesOwned: bigint;
  reservedShares: bigint;
  company: {
    id: number;
    tickerSymbol: string;
    companyName: string;
    foundingCost: Prisma.Decimal | null;
    totalSharesIssued: bigint;
    splitMultiplier: Prisma.Decimal;
  };
};

async function calcHoldings(rawHoldings: StockHoldingWithCompany[]) {
  const withShares = rawHoldings.filter(h => Number(h.sharesOwned) > 0);

  const holdings = await Promise.all(
    withShares.map(async (h) => {
      const currentPrice = await getVWAPPrice({
        companyId: h.company.id,
        foundingCost: h.company.foundingCost ? Number(h.company.foundingCost) : null,
        totalSharesIssued: h.company.totalSharesIssued,
        splitMultiplier: Number(h.company.splitMultiplier),
      });
      const positionValue = Number(h.sharesOwned) * currentPrice;

      return {
        ticker: h.company.tickerSymbol,
        companyName: h.company.companyName,
        sharesOwned: Number(h.sharesOwned),
        reservedShares: Number(h.reservedShares),
        availableShares: Number(h.sharesOwned) - Number(h.reservedShares),
        totalSharesIssued: Number(h.company.totalSharesIssued),
        currentPrice,
        positionValue,
      };
    })
  );

  const stockValue = holdings.reduce((sum, h) => sum + h.positionValue, 0);
  return { holdings, stockValue };
}

// Register a new user
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      return res.status(400).json({ error: usernameValidation.error });
    }
    const sanitizedUsername = username.trim();

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.error });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        username: sanitizedUsername,
        passwordHash,
        account: {
          create: {
            cashBalance: 100000.00,
            reservedCash: 0.00,
            totalAssetValue: 100000.00,
          },
        },
      },
      include: {
        account: true,
      },
    });

    const token = generateToken({
      userId: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
    });

    return res.status(201).json({
      id: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
      token,
      cashBalance: Number(user.account?.cashBalance ?? 0),
      createdAt: user.createdAt,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'Username already exists' });
      }
    }
    logger.error('Error in users route', error);
    return res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login endpoint
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { username: username.trim() },
      include: { account: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = generateToken({
      userId: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
    });

    return res.json({
      id: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
      token,
      cashBalance: Number(user.account?.cashBalance ?? 0),
    });
  } catch (error) {
    logger.error('Error in users route', error);
    return res.status(500).json({ error: 'Failed to log in' });
  }
});

// Get user portfolio by username
router.get('/by-username/:username/portfolio', async (req: Request<{ username: string }>, res: Response) => {
  try {
    const { username } = req.params;

    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        account: true,
        stockHoldings: { include: { company: true } },
      },
    });

    if (!user || !user.account) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { holdings, stockValue } = await calcHoldings(user.stockHoldings);
    const cashBalance = Number(user.account.cashBalance);
    const reservedCash = Number(user.account.reservedCash);

    return res.json({
      id: user.id,
      username: user.username,
      cashBalance,
      reservedCash,
      availableCash: cashBalance - reservedCash,
      stockValue,
      totalValue: cashBalance + stockValue,
      holdings,
      createdAt: user.createdAt,
    });
  } catch (error) {
    logger.error('Error in users route', error);
    return res.status(500).json({ error: 'Failed to fetch user portfolio' });
  }
});

// Get user by ID
router.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user ID' });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        account: true,
        stockHoldings: { include: { company: true } },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const cashBalance = Number(user.account?.cashBalance ?? 0);
    const reservedCash = Number(user.account?.reservedCash ?? 0);

    return res.json({
      id: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
      cashBalance,
      reservedCash,
      availableCash: cashBalance - reservedCash,
      holdings: user.stockHoldings
        .filter(h => Number(h.sharesOwned) > 0)
        .map(h => ({
          ticker: h.company.tickerSymbol,
          companyName: h.company.companyName,
          sharesOwned: Number(h.sharesOwned),
          reservedShares: Number(h.reservedShares),
          availableShares: Number(h.sharesOwned) - Number(h.reservedShares),
        })),
      createdAt: user.createdAt,
    });
  } catch (error) {
    logger.error('Error in users route', error);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Get user portfolio with calculated values
router.get('/:id/portfolio', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user ID' });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        account: true,
        stockHoldings: { include: { company: true } },
      },
    });

    if (!user || !user.account) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { holdings, stockValue } = await calcHoldings(user.stockHoldings);
    const cashBalance = Number(user.account.cashBalance);
    const reservedCash = Number(user.account.reservedCash);

    return res.json({
      username: user.username,
      cashBalance,
      reservedCash,
      availableCash: cashBalance - reservedCash,
      stockValue,
      totalValue: cashBalance + stockValue,
      holdings,
    });
  } catch (error) {
    logger.error('Error in users route', error);
    return res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
});

// Get leaderboard
router.get('/', async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true, isAdmin: false },
      include: {
        account: true,
        stockHoldings: { include: { company: true } },
      },
    });

    const leaderboard = await Promise.all(
      users.map(async (user) => {
        const holdingValues = await Promise.all(
          user.stockHoldings
            .filter(h => Number(h.sharesOwned) > 0)
            .map(async (h) => {
              const currentPrice = await getVWAPPrice({
                companyId: h.company.id,
                foundingCost: h.company.foundingCost ? Number(h.company.foundingCost) : null,
                totalSharesIssued: h.company.totalSharesIssued,
                splitMultiplier: Number(h.company.splitMultiplier),
              });
              return Number(h.sharesOwned) * currentPrice;
            })
        );

        const stockValue = holdingValues.reduce((sum, val) => sum + val, 0);
        const cashBalance = Number(user.account?.cashBalance || 0);

        return {
          id: user.id,
          username: user.username,
          cashBalance,
          stockValue,
          totalValue: cashBalance + stockValue,
        };
      })
    );

    leaderboard.sort((a, b) => b.totalValue - a.totalValue);

    return res.json(leaderboard);
  } catch (error) {
    logger.error('Error in users route', error);
    return res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get portfolio value history for a user
router.get('/by-username/:username/portfolio-history', async (req: Request<{ username: string }>, res: Response) => {
  try {
    const { username } = req.params;

    const user = await prisma.user.findUnique({
      where: { username },
      include: { account: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { buyerId: user.id },
          { sellerId: user.id },
        ],
      },
      include: { company: true },
      orderBy: { timestamp: 'asc' },
      take: 1000,
    });

    const startingCash = 100000;
    let cash = startingCash;
    const holdings: Record<number, { shares: number; companyId: number }> = {};
    const stockPrices: Record<number, number> = {};

    const history: { timestamp: string; value: number }[] = [
      { timestamp: user.createdAt.toISOString(), value: startingCash },
    ];

    for (const tx of transactions) {
      const amount = Number(tx.totalAmount);
      const shares = Number(tx.sharesTraded);
      const companyId = tx.companyId;

      stockPrices[companyId] = Number(tx.pricePerShare);

      if (tx.buyerId === user.id) {
        cash -= amount;
        holdings[companyId] = holdings[companyId] || { shares: 0, companyId };
        holdings[companyId].shares += shares;
      } else {
        cash += amount;
        holdings[companyId] = holdings[companyId] || { shares: 0, companyId };
        holdings[companyId].shares -= shares;
      }

      let stockValue = 0;
      for (const h of Object.values(holdings)) {
        stockValue += h.shares * (stockPrices[h.companyId] || 0);
      }

      history.push({
        timestamp: tx.timestamp.toISOString(),
        value: cash + stockValue,
      });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        account: true,
        stockHoldings: { include: { company: true } },
      },
    });

    if (currentUser?.account) {
      const { stockValue } = await calcHoldings(currentUser.stockHoldings);
      history.push({
        timestamp: new Date().toISOString(),
        value: Number(currentUser.account.cashBalance) + stockValue,
      });
    }

    return res.json(history);
  } catch (error) {
    logger.error('Error in users route', error);
    return res.status(500).json({ error: 'Failed to fetch portfolio history' });
  }
});

export default router;
