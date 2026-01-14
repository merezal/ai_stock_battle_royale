import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { hashPassword, verifyPassword, generateToken, validatePassword } from '../lib/auth';
import { authenticate, authorizeUser } from '../middleware/auth';
import { validateUsername } from '../lib/utils';
import { getVWAPPrice } from '../lib/pricing';
import { logger } from '../lib/logger';

const router = Router();

// Register a new user
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Validate and sanitize username
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      return res.status(400).json({ error: usernameValidation.error });
    }
    const sanitizedUsername = username.trim();

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.error });
    }

    // Hash password
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

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      username: user.username,
    });

    return res.status(201).json({
      id: user.id,
      username: user.username,
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

    // Find user
    const user = await prisma.user.findUnique({
      where: { username: username.trim() },
      include: { account: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      username: user.username,
    });

    return res.json({
      id: user.id,
      username: user.username,
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
        stockHoldings: {
          include: {
            company: true,
          },
        },
      },
    });

    if (!user || !user.account) {
      return res.status(404).json({ error: 'User not found' });
    }

    let stockValue = 0;
    const holdingsWithShares = user.stockHoldings.filter(h => Number(h.sharesOwned) > 0);

    // Calculate VWAP for each holding in parallel
    const holdings = await Promise.all(
      holdingsWithShares.map(async (h) => {
        const currentPrice = await getVWAPPrice({
          companyId: h.company.id,
          foundingCost: h.company.foundingCost ? Number(h.company.foundingCost) : null,
          totalSharesIssued: h.company.totalSharesIssued,
          splitMultiplier: Number(h.company.splitMultiplier),
        });
        const positionValue = Number(h.sharesOwned) * currentPrice;
        stockValue += positionValue;

        return {
          ticker: h.company.tickerSymbol,
          companyName: h.company.companyName,
          sharesOwned: Number(h.sharesOwned),
          reservedShares: Number(h.reservedShares),
          availableShares: Number(h.sharesOwned) - Number(h.reservedShares),
          currentPrice,
          positionValue,
        };
      })
    );

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
    const userId = parseInt(req.params.id);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        account: true,
        stockHoldings: {
          include: {
            company: true,
          },
        },
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
    const userId = parseInt(req.params.id);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        account: true,
        stockHoldings: {
          include: {
            company: true,
          },
        },
      },
    });

    if (!user || !user.account) {
      return res.status(404).json({ error: 'User not found' });
    }

    let stockValue = 0;
    const holdingsWithShares = user.stockHoldings.filter(h => Number(h.sharesOwned) > 0);

    // Calculate VWAP for each holding in parallel
    const holdings = await Promise.all(
      holdingsWithShares.map(async (h) => {
        const currentPrice = await getVWAPPrice({
          companyId: h.company.id,
          foundingCost: h.company.foundingCost ? Number(h.company.foundingCost) : null,
          totalSharesIssued: h.company.totalSharesIssued,
          splitMultiplier: Number(h.company.splitMultiplier),
        });
        const positionValue = Number(h.sharesOwned) * currentPrice;
        stockValue += positionValue;

        return {
          ticker: h.company.tickerSymbol,
          companyName: h.company.companyName,
          sharesOwned: Number(h.sharesOwned),
          reservedShares: Number(h.reservedShares),
          availableShares: Number(h.sharesOwned) - Number(h.reservedShares),
          currentPrice,
          positionValue,
        };
      })
    );

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
      where: { isActive: true },
      include: {
        account: true,
        stockHoldings: {
          include: {
            company: true,
          },
        },
      },
    });

    // Calculate stock values for all users in parallel
    const leaderboard = await Promise.all(
      users.map(async (user) => {
        const holdingsWithShares = user.stockHoldings.filter(h => Number(h.sharesOwned) > 0);

        // Calculate VWAP for each holding
        const holdingValues = await Promise.all(
          holdingsWithShares.map(async (h) => {
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
      include: {
        account: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get all transactions involving this user
    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { buyerId: user.id },
          { sellerId: user.id },
        ],
      },
      include: {
        company: true,
      },
      orderBy: { timestamp: 'asc' },
    });

    // Starting cash is 100000, simulate portfolio value over time
    const startingCash = 100000;
    let cash = startingCash;
    const holdings: Record<number, { shares: number; companyId: number }> = {};

    // Track the price of each stock at each transaction
    const stockPrices: Record<number, number> = {};

    const history: { timestamp: string; value: number }[] = [
      { timestamp: user.createdAt.toISOString(), value: startingCash },
    ];

    for (const tx of transactions) {
      const amount = Number(tx.totalAmount);
      const shares = Number(tx.sharesTraded);
      const companyId = tx.companyId;

      // Update stock price
      stockPrices[companyId] = Number(tx.pricePerShare);

      if (tx.buyerId === user.id) {
        // User bought shares
        cash -= amount;
        holdings[companyId] = holdings[companyId] || { shares: 0, companyId };
        holdings[companyId].shares += shares;
      } else {
        // User sold shares
        cash += amount;
        holdings[companyId] = holdings[companyId] || { shares: 0, companyId };
        holdings[companyId].shares -= shares;
      }

      // Calculate total portfolio value at this point
      let stockValue = 0;
      for (const h of Object.values(holdings)) {
        const price = stockPrices[h.companyId] || 0;
        stockValue += h.shares * price;
      }

      history.push({
        timestamp: tx.timestamp.toISOString(),
        value: cash + stockValue,
      });
    }

    // Add current value as final point
    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        account: true,
        stockHoldings: {
          include: {
            company: true,
          },
        },
      },
    });

    if (currentUser && currentUser.account) {
      const holdingsWithShares = currentUser.stockHoldings.filter(h => Number(h.sharesOwned) > 0);

      // Calculate VWAP for each holding
      const holdingValues = await Promise.all(
        holdingsWithShares.map(async (h) => {
          const price = await getVWAPPrice({
            companyId: h.company.id,
            foundingCost: h.company.foundingCost ? Number(h.company.foundingCost) : null,
            totalSharesIssued: h.company.totalSharesIssued,
            splitMultiplier: Number(h.company.splitMultiplier),
          });
          return Number(h.sharesOwned) * price;
        })
      );

      const currentStockValue = holdingValues.reduce((sum, val) => sum + val, 0);

      history.push({
        timestamp: new Date().toISOString(),
        value: Number(currentUser.account.cashBalance) + currentStockValue,
      });
    }

    return res.json(history);
  } catch (error) {
    logger.error('Error in users route', error);
    return res.status(500).json({ error: 'Failed to fetch portfolio history' });
  }
});

export default router;
