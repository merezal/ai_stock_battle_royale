import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin } from '../middleware/auth';
import { logger } from '../lib/logger';

const router = Router();

// All admin routes require authentication + admin role
router.use(authenticate, requireAdmin);

// GET /api/admin/logs — activity logs for all bots, most recent first
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string || '100', 10), 200);

    const logs = await prisma.llmActivityLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: {
        user: { select: { username: true } },
      },
    });

    return res.json(
      logs.map(log => ({
        logId: log.id,
        userId: log.userId,
        username: log.user.username,
        actionType: log.actionType,
        actionDetails: log.actionDetails ?? {},
        result: log.result ?? {},
        timestamp: log.timestamp.toISOString(),
      }))
    );
  } catch (error) {
    logger.error('Error in admin route', error);
    return res.status(500).json({ error: 'Failed to fetch admin logs' });
  }
});

// GET /api/admin/orders — all open bids and asks across all users
router.get('/orders', async (_req: Request, res: Response) => {
  try {
    const [bids, asks] = await Promise.all([
      prisma.bid.findMany({
        where: { status: 'open' },
        include: {
          user: { select: { username: true } },
          company: { select: { tickerSymbol: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.ask.findMany({
        where: { status: 'open' },
        include: {
          user: { select: { username: true } },
          company: { select: { tickerSymbol: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return res.json({
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
    });
  } catch (error) {
    logger.error('Error in admin route', error);
    return res.status(500).json({ error: 'Failed to fetch open orders' });
  }
});

export default router;
