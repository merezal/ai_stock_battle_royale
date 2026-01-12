import { prisma } from '../lib/prisma';

// Tool definitions for MCP protocol
export const toolDefinitions = [
  {
    name: 'get_my_portfolio',
    description: 'Get your current portfolio including cash balance, holdings, and total value',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_user_portfolio',
    description: 'Get another user\'s portfolio to analyze their positions',
    parameters: {
      type: 'object',
      properties: {
        username: {
          type: 'string',
          description: 'The username to look up',
        },
      },
      required: ['username'],
    },
  },
  {
    name: 'get_companies',
    description: 'Get list of all companies with their current stock prices',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_company_details',
    description: 'Get detailed information about a specific company including shareholders',
    parameters: {
      type: 'object',
      properties: {
        ticker: {
          type: 'string',
          description: 'The stock ticker symbol',
        },
      },
      required: ['ticker'],
    },
  },
  {
    name: 'get_order_book',
    description: 'Get current open bids and asks for a stock (or all stocks if no ticker specified)',
    parameters: {
      type: 'object',
      properties: {
        ticker: {
          type: 'string',
          description: 'Optional stock ticker to filter by',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_recent_transactions',
    description: 'Get recent transaction history for a stock or user',
    parameters: {
      type: 'object',
      properties: {
        ticker: {
          type: 'string',
          description: 'Optional stock ticker to filter by',
        },
        username: {
          type: 'string',
          description: 'Optional username to filter by',
        },
        limit: {
          type: 'number',
          description: 'Number of transactions to return (default 20)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_posts',
    description: 'Get social posts to analyze market sentiment and other users\' opinions',
    parameters: {
      type: 'object',
      properties: {
        ticker: {
          type: 'string',
          description: 'Optional stock ticker to filter posts about',
        },
        limit: {
          type: 'number',
          description: 'Number of posts to return (default 20)',
        },
      },
      required: [],
    },
  },
  {
    name: 'place_bid',
    description: 'Place one or more buy orders (bids) for shares. This reserves your cash until orders are fulfilled or cancelled.',
    parameters: {
      type: 'object',
      properties: {
        bids: {
          type: 'array',
          description: 'Array of one or more bids to place. Each bid should have ticker, shares, and pricePerShare',
          items: {
            type: 'object',
            properties: {
              ticker: { type: 'string', description: 'Stock ticker symbol' },
              shares: { type: 'number', description: 'Number of shares to buy' },
              pricePerShare: { type: 'number', description: 'Maximum price per share willing to pay' },
            },
            required: ['ticker', 'shares', 'pricePerShare'],
          },
          minItems: 1,
        },
      },
      required: ['bids'],
    },
  },
  {
    name: 'place_ask',
    description: 'Place one or more sell orders (asks) for shares you own. This reserves your shares until orders are fulfilled or cancelled.',
    parameters: {
      type: 'object',
      properties: {
        asks: {
          type: 'array',
          description: 'Array of one or more asks to place. Each ask should have ticker, shares, and pricePerShare',
          items: {
            type: 'object',
            properties: {
              ticker: { type: 'string', description: 'Stock ticker symbol' },
              shares: { type: 'number', description: 'Number of shares to sell' },
              pricePerShare: { type: 'number', description: 'Minimum price per share you want' },
            },
            required: ['ticker', 'shares', 'pricePerShare'],
          },
          minItems: 1,
        },
      },
      required: ['asks'],
    },
  },
  {
    name: 'fulfill_bid',
    description: 'Sell your shares to fulfill one or more buy orders. You receive cash immediately.',
    parameters: {
      type: 'object',
      properties: {
        bidIds: {
          type: 'array',
          description: 'Array of one or more bid IDs to fulfill',
          items: {
            type: 'number',
          },
          minItems: 1,
        },
      },
      required: ['bidIds'],
    },
  },
  {
    name: 'fulfill_ask',
    description: 'Buy shares from one or more sell orders. You pay the ask price immediately.',
    parameters: {
      type: 'object',
      properties: {
        askIds: {
          type: 'array',
          description: 'Array of one or more ask IDs to fulfill',
          items: {
            type: 'number',
          },
          minItems: 1,
        },
      },
      required: ['askIds'],
    },
  },
  {
    name: 'cancel_bid',
    description: 'Cancel one or more of your open buy orders to get your reserved cash back.',
    parameters: {
      type: 'object',
      properties: {
        bidIds: {
          type: 'array',
          description: 'Array of one or more bid IDs to cancel',
          items: {
            type: 'number',
          },
          minItems: 1,
        },
      },
      required: ['bidIds'],
    },
  },
  {
    name: 'cancel_ask',
    description: 'Cancel one or more of your open sell orders to get your reserved shares back.',
    parameters: {
      type: 'object',
      properties: {
        askIds: {
          type: 'array',
          description: 'Array of one or more ask IDs to cancel',
          items: {
            type: 'number',
          },
          minItems: 1,
        },
      },
      required: ['askIds'],
    },
  },
  {
    name: 'get_my_open_orders',
    description: 'Get your current open bids and asks',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// Helper to get current price for a company (adjusted for splits)
async function getCurrentPrice(companyId: number, foundingCost: number | null, totalShares: bigint, companySplitMultiplier?: number): Promise<number> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { splitMultiplier: true },
  });

  const splitMultiplier = companySplitMultiplier ?? Number(company?.splitMultiplier ?? 1);

  const lastTransaction = await prisma.transaction.findFirst({
    where: { companyId },
    orderBy: { timestamp: 'desc' },
  });

  if (lastTransaction) {
    // Price adjusted for splits: transactionPrice * (company.splitMultiplier / transaction.splitMultiplier)
    return Number(lastTransaction.pricePerShare) * (splitMultiplier / Number(lastTransaction.splitMultiplier));
  }

  // No transactions yet, use founding price
  if (foundingCost) {
    return Number(foundingCost) / Number(totalShares);
  }

  return 0;
}

// Tool execution functions
export async function executeGetMyPortfolio(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      account: true,
      stockHoldings: {
        include: { company: true },
      },
    },
  });

  if (!user || !user.account) {
    return { error: 'User not found' };
  }

  const holdings = await Promise.all(
    user.stockHoldings
      .filter((h) => Number(h.sharesOwned) > 0)
      .map(async (h) => {
        const price = await getCurrentPrice(h.companyId, Number(h.company.foundingCost), h.company.totalSharesIssued);
        return {
          ticker: h.company.tickerSymbol,
          companyName: h.company.companyName,
          sharesOwned: Number(h.sharesOwned),
          reservedShares: Number(h.reservedShares),
          availableShares: Number(h.sharesOwned) - Number(h.reservedShares),
          currentPrice: price,
          positionValue: Number(h.sharesOwned) * price,
        };
      })
  );

  const stockValue = holdings.reduce((sum, h) => sum + h.positionValue, 0);

  return {
    username: user.username,
    cashBalance: Number(user.account.cashBalance),
    reservedCash: Number(user.account.reservedCash),
    availableCash: Number(user.account.cashBalance) - Number(user.account.reservedCash),
    stockValue,
    totalValue: Number(user.account.cashBalance) + stockValue,
    holdings,
  };
}

export async function executeGetUserPortfolio(username: string) {
  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      account: true,
      stockHoldings: {
        include: { company: true },
      },
    },
  });

  if (!user || !user.account) {
    return { error: `User '${username}' not found` };
  }

  const holdings = await Promise.all(
    user.stockHoldings
      .filter((h) => Number(h.sharesOwned) > 0)
      .map(async (h) => {
        const price = await getCurrentPrice(h.companyId, Number(h.company.foundingCost), h.company.totalSharesIssued);
        return {
          ticker: h.company.tickerSymbol,
          companyName: h.company.companyName,
          sharesOwned: Number(h.sharesOwned),
          currentPrice: price,
          positionValue: Number(h.sharesOwned) * price,
        };
      })
  );

  const stockValue = holdings.reduce((sum, h) => sum + h.positionValue, 0);

  return {
    username: user.username,
    cashBalance: Number(user.account.cashBalance),
    stockValue,
    totalValue: Number(user.account.cashBalance) + stockValue,
    holdings,
  };
}

export async function executeGetCompanies() {
  const companies = await prisma.company.findMany({
    include: {
      founder: { select: { username: true } },
    },
  });

  return Promise.all(
    companies.map(async (c) => {
      const price = await getCurrentPrice(c.id, Number(c.foundingCost), c.totalSharesIssued);
      return {
        ticker: c.tickerSymbol,
        companyName: c.companyName,
        currentPrice: price,
        totalShares: Number(c.totalSharesIssued),
        marketCap: price * Number(c.totalSharesIssued),
        foundedBy: c.founder?.username,
      };
    })
  );
}

export async function executeGetCompanyDetails(ticker: string) {
  const company = await prisma.company.findUnique({
    where: { tickerSymbol: ticker.toUpperCase() },
    include: {
      founder: { select: { username: true } },
      stockHoldings: {
        include: { user: { select: { username: true } } },
        where: { sharesOwned: { gt: 0 } },
      },
    },
  });

  if (!company) {
    return { error: `Company '${ticker}' not found` };
  }

  const price = await getCurrentPrice(company.id, Number(company.foundingCost), company.totalSharesIssued);

  return {
    ticker: company.tickerSymbol,
    companyName: company.companyName,
    currentPrice: price,
    totalShares: Number(company.totalSharesIssued),
    marketCap: price * Number(company.totalSharesIssued),
    foundedBy: company.founder?.username,
    shareholders: company.stockHoldings.map((h) => ({
      username: h.user.username,
      shares: Number(h.sharesOwned),
      percentOwnership: (Number(h.sharesOwned) / Number(company.totalSharesIssued) * 100).toFixed(2) + '%',
    })),
  };
}

export async function executeGetOrderBook(ticker?: string) {
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

  return {
    bids: bids.map((b) => ({
      bidId: b.id,
      username: b.user.username,
      ticker: b.company.tickerSymbol,
      shares: Number(b.sharesRequested),
      pricePerShare: Number(b.pricePerShare),
      totalCost: Number(b.totalCost),
    })),
    asks: asks.map((a) => ({
      askId: a.id,
      username: a.user.username,
      ticker: a.company.tickerSymbol,
      shares: Number(a.sharesOffered),
      pricePerShare: Number(a.pricePerShare),
    })),
  };
}

export async function executeGetRecentTransactions(ticker?: string, username?: string, limit = 20) {
  const whereClause: Record<string, unknown> = {};

  if (ticker) {
    whereClause.company = { tickerSymbol: ticker.toUpperCase() };
  }

  if (username) {
    const user = await prisma.user.findUnique({ where: { username } });
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

  return transactions.map((t) => ({
    transactionId: t.id,
    buyer: t.buyer.username,
    seller: t.seller.username,
    ticker: t.company.tickerSymbol,
    shares: Number(t.sharesTraded),
    pricePerShare: Number(t.pricePerShare),
    totalAmount: Number(t.totalAmount),
    timestamp: t.timestamp.toISOString(),
  }));
}

export async function executeGetPosts(ticker?: string, limit = 20) {
  const whereClause = ticker
    ? { mentionedCompany: { tickerSymbol: ticker.toUpperCase() } }
    : {};

  const posts = await prisma.post.findMany({
    where: whereClause,
    include: {
      user: {
        select: {
          username: true,
          stockHoldings: {
            include: { company: { select: { tickerSymbol: true } } },
          },
        },
      },
      mentionedCompany: { select: { tickerSymbol: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return posts.map((p) => ({
    postId: p.id,
    author: p.user.username,
    content: p.content,
    mentionedTicker: p.mentionedCompany?.tickerSymbol,
    createdAt: p.createdAt.toISOString(),
    authorHoldings: p.user.stockHoldings.map((h) => ({
      ticker: h.company.tickerSymbol,
      shares: Number(h.sharesOwned),
    })),
  }));
}

export async function executePlaceBid(userId: number, bids: Array<{ ticker: string; shares: number; pricePerShare: number }>) {
  if (!bids || bids.length === 0) {
    return { error: 'No bids provided. Must provide array of one or more bids.' };
  }

  // Get user account
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { account: true },
  });

  if (!user || !user.account) {
    return { error: 'User not found' };
  }

  // Calculate total cost and validate companies
  let totalCost = 0;
  const bidData: Array<{ ticker: string; shares: number; pricePerShare: number; companyId: number; totalCost: number }> = [];

  for (const bid of bids) {
    // Validate positive shares and price
    if (bid.shares <= 0 || bid.pricePerShare <= 0) {
      return { error: `Shares and price must be positive. Got shares: ${bid.shares}, pricePerShare: ${bid.pricePerShare}` };
    }

    const company = await prisma.company.findUnique({
      where: { tickerSymbol: bid.ticker.toUpperCase() },
    });

    if (!company) {
      return { error: `Company '${bid.ticker}' not found` };
    }

    const bidCost = bid.shares * bid.pricePerShare;
    totalCost += bidCost;

    bidData.push({
      ticker: bid.ticker.toUpperCase(),
      shares: bid.shares,
      pricePerShare: bid.pricePerShare,
      companyId: company.id,
      totalCost: bidCost,
    });
  }

  const availableCash = Number(user.account.cashBalance) - Number(user.account.reservedCash);
  if (totalCost > availableCash) {
    return { error: `Insufficient funds. Need $${totalCost}, have $${availableCash} available.` };
  }

  // Place all bids in a transaction
  const results = await prisma.$transaction(async (tx) => {
    // Reserve total cash
    await tx.account.update({
      where: { userId },
      data: { reservedCash: { increment: totalCost } },
    });

    // Create all bids
    const createdBids = [];
    for (const bid of bidData) {
      const createdBid = await tx.bid.create({
        data: {
          userId,
          companyId: bid.companyId,
          sharesRequested: BigInt(bid.shares),
          pricePerShare: bid.pricePerShare,
          totalCost: bid.totalCost,
          status: 'open',
        },
      });
      createdBids.push({
        bidId: createdBid.id,
        ticker: bid.ticker,
        shares: bid.shares,
        pricePerShare: bid.pricePerShare,
        totalCost: bid.totalCost,
      });
    }
    return createdBids;
  });

  return {
    success: true,
    bids: results,
    totalCost,
    remainingAvailableCash: availableCash - totalCost,
  };
}

export async function executePlaceAsk(userId: number, asks: Array<{ ticker: string; shares: number; pricePerShare: number }>) {
  if (!asks || asks.length === 0) {
    return { error: 'No asks provided. Must provide array of one or more asks.' };
  }

  // Validate companies and holdings
  const askData: Array<{ ticker: string; shares: number; pricePerShare: number; companyId: number; holding: any }> = [];

  for (const ask of asks) {
    // Validate positive shares and price
    if (ask.shares <= 0 || ask.pricePerShare <= 0) {
      return { error: `Shares and price must be positive. Got shares: ${ask.shares}, pricePerShare: ${ask.pricePerShare}` };
    }

    const company = await prisma.company.findUnique({
      where: { tickerSymbol: ask.ticker.toUpperCase() },
    });

    if (!company) {
      return { error: `Company '${ask.ticker}' not found` };
    }

    const holding = await prisma.stockHolding.findUnique({
      where: {
        userId_companyId: { userId, companyId: company.id },
      },
    });

    if (!holding) {
      return { error: `You do not own any shares of ${ask.ticker}` };
    }

    askData.push({
      ticker: ask.ticker.toUpperCase(),
      shares: ask.shares,
      pricePerShare: ask.pricePerShare,
      companyId: company.id,
      holding,
    });
  }

  // Check if user has enough shares for all asks
  const sharesByCompany = new Map<number, number>();
  for (const ask of askData) {
    const current = sharesByCompany.get(ask.companyId) || 0;
    sharesByCompany.set(ask.companyId, current + ask.shares);
  }

  for (const ask of askData) {
    const totalSharesNeeded = sharesByCompany.get(ask.companyId) || 0;
    const availableShares = Number(ask.holding.sharesOwned) - Number(ask.holding.reservedShares);
    if (totalSharesNeeded > availableShares) {
      return { error: `Insufficient shares of ${ask.ticker}. Need ${totalSharesNeeded}, have ${availableShares} available.` };
    }
  }

  // Place all asks in a transaction
  const results = await prisma.$transaction(async (tx) => {
    const createdAsks = [];

    for (const ask of askData) {
      // Reserve shares
      await tx.stockHolding.update({
        where: {
          userId_companyId: { userId, companyId: ask.companyId },
        },
        data: { reservedShares: { increment: BigInt(ask.shares) } },
      });

      // Create ask
      const createdAsk = await tx.ask.create({
        data: {
          userId,
          companyId: ask.companyId,
          sharesOffered: BigInt(ask.shares),
          pricePerShare: ask.pricePerShare,
          status: 'open',
        },
      });

      createdAsks.push({
        askId: createdAsk.id,
        ticker: ask.ticker,
        shares: ask.shares,
        pricePerShare: ask.pricePerShare,
      });
    }

    return createdAsks;
  });

  return {
    success: true,
    asks: results,
  };
}

export async function executeFulfillBid(userId: number, bidIds: number[]) {
  if (!bidIds || bidIds.length === 0) {
    return { error: 'No bid IDs provided. Must provide array of one or more bid IDs.' };
  }

  console.log(`[executeFulfillBid] Attempting to fulfill ${bidIds.length} bid(s) for user ${userId}:`, bidIds);

  // Fetch all bids
  const bids = await prisma.bid.findMany({
    where: { id: { in: bidIds } },
    include: { company: true },
  });

  if (bids.length !== bidIds.length) {
    const foundIds = bids.map(b => b.id);
    const missingIds = bidIds.filter(id => !foundIds.includes(id));
    console.log(`[executeFulfillBid] Bid(s) not found: ${missingIds.join(', ')}`);
    return { error: `Bid(s) not found: ${missingIds.join(', ')}` };
  }

  // Validate all bids
  for (const bid of bids) {
    if (bid.status !== 'open') {
      return { error: `Bid ${bid.id} is no longer open (status: ${bid.status})` };
    }
    if (bid.userId === userId) {
      return { error: `Cannot fulfill your own bid (bid ${bid.id})` };
    }
  }

  // Check if user has enough shares for all bids (grouped by company)
  const sharesByCompany = new Map<number, bigint>();
  for (const bid of bids) {
    const current = sharesByCompany.get(bid.companyId) || BigInt(0);
    sharesByCompany.set(bid.companyId, current + bid.sharesRequested);
  }

  // Get current holdings for all companies
  const holdings = await prisma.stockHolding.findMany({
    where: {
      userId,
      companyId: { in: Array.from(sharesByCompany.keys()) },
    },
  });

  const holdingsByCompany = new Map(holdings.map(h => [h.companyId, h]));

  // Validate sufficient shares for each company
  for (const [companyId, sharesNeeded] of sharesByCompany.entries()) {
    const holding = holdingsByCompany.get(companyId);
    const availableShares = holding
      ? holding.sharesOwned - holding.reservedShares
      : BigInt(0);

    if (sharesNeeded > availableShares) {
      const company = bids.find(b => b.companyId === companyId)?.company;
      return { error: `Insufficient shares of ${company?.tickerSymbol || 'company'}. Need ${sharesNeeded}, have ${availableShares} available.` };
    }
  }

  console.log(`[executeFulfillBid] Validation passed. Proceeding with transaction.`);

  // Execute all fulfillments in a single transaction
  const results = await prisma.$transaction(async (tx) => {
    // Double-check all bids are still open
    const currentBids = await tx.bid.findMany({
      where: { id: { in: bidIds } },
      select: { id: true, status: true },
    });

    for (const currentBid of currentBids) {
      if (currentBid.status !== 'open') {
        throw new Error(`Bid ${currentBid.id} was already fulfilled or cancelled`);
      }
    }

    const transactions = [];
    const sellerShareChanges = new Map<number, bigint>(); // companyId -> shares to subtract
    const buyerShareChanges = new Map<string, { companyId: number; buyerId: number; shares: bigint }>(); // key: userId-companyId
    let totalCashReceived = 0;

    // Calculate all changes first
    for (const bid of bids) {
      // Track seller share changes
      const currentSellerShares = sellerShareChanges.get(bid.companyId) || BigInt(0);
      sellerShareChanges.set(bid.companyId, currentSellerShares + bid.sharesRequested);

      // Track buyer share changes
      const buyerKey = `${bid.userId}-${bid.companyId}`;
      const currentBuyerData = buyerShareChanges.get(buyerKey);
      if (currentBuyerData) {
        currentBuyerData.shares += bid.sharesRequested;
      } else {
        buyerShareChanges.set(buyerKey, {
          companyId: bid.companyId,
          buyerId: bid.userId,
          shares: bid.sharesRequested,
        });
      }

      totalCashReceived += Number(bid.totalCost);
    }

    // Apply seller share changes
    for (const [companyId, sharesToSubtract] of sellerShareChanges.entries()) {
      const updatedHolding = await tx.stockHolding.update({
        where: {
          userId_companyId: { userId, companyId },
        },
        data: { sharesOwned: { decrement: sharesToSubtract } },
      });

      // Delete holding if shares reached 0
      if (updatedHolding.sharesOwned === BigInt(0)) {
        await tx.stockHolding.delete({
          where: {
            userId_companyId: { userId, companyId },
          },
        });
      }
    }

    // Apply buyer share changes
    for (const [, data] of buyerShareChanges.entries()) {
      await tx.stockHolding.upsert({
        where: {
          userId_companyId: { userId: data.buyerId, companyId: data.companyId },
        },
        create: {
          userId: data.buyerId,
          companyId: data.companyId,
          sharesOwned: data.shares,
          reservedShares: 0,
        },
        update: { sharesOwned: { increment: data.shares } },
      });
    }

    // Update accounts for each buyer
    const buyersProcessed = new Set<number>();
    for (const bid of bids) {
      if (!buyersProcessed.has(bid.userId)) {
        const totalCostForBuyer = bids
          .filter(b => b.userId === bid.userId)
          .reduce((sum, b) => sum + Number(b.totalCost), 0);

        await tx.account.update({
          where: { userId: bid.userId },
          data: {
            cashBalance: { decrement: totalCostForBuyer },
            reservedCash: { decrement: totalCostForBuyer },
          },
        });

        buyersProcessed.add(bid.userId);
      }
    }

    // Update seller account
    await tx.account.update({
      where: { userId },
      data: { cashBalance: { increment: totalCashReceived } },
    });

    // Mark all bids as fulfilled
    await tx.bid.updateMany({
      where: { id: { in: bidIds } },
      data: { status: 'fulfilled' },
    });

    // Create transactions for each bid
    for (const bid of bids) {
      const company = await tx.company.findUnique({
        where: { id: bid.companyId },
        select: { splitMultiplier: true },
      });

      const transaction = await tx.transaction.create({
        data: {
          buyerId: bid.userId,
          sellerId: userId,
          companyId: bid.companyId,
          sharesTraded: bid.sharesRequested,
          pricePerShare: bid.pricePerShare,
          totalAmount: bid.totalCost,
          bidId: bid.id,
          transactionType: 'bid_fulfillment',
          splitMultiplier: company?.splitMultiplier ?? 1.0,
        },
      });

      transactions.push({
        transactionId: transaction.id,
        bidId: bid.id,
        ticker: bid.company.tickerSymbol,
        sharesSold: Number(bid.sharesRequested),
        pricePerShare: Number(bid.pricePerShare),
        cashReceived: Number(bid.totalCost),
      });
    }

    return { transactions, totalCashReceived };
  });

  console.log(`[executeFulfillBid] Successfully fulfilled ${bidIds.length} bid(s). Total cash: $${results.totalCashReceived}`);

  return {
    success: true,
    fulfillments: results.transactions,
    totalCashReceived: results.totalCashReceived,
  };
}

export async function executeFulfillAsk(userId: number, askIds: number[]) {
  if (!askIds || askIds.length === 0) {
    return { error: 'No ask IDs provided. Must provide array of one or more ask IDs.' };
  }

  console.log(`[executeFulfillAsk] Attempting to fulfill ${askIds.length} ask(s) for user ${userId}:`, askIds);

  // Fetch all asks
  const asks = await prisma.ask.findMany({
    where: { id: { in: askIds } },
    include: { company: true },
  });

  if (asks.length !== askIds.length) {
    const foundIds = asks.map(a => a.id);
    const missingIds = askIds.filter(id => !foundIds.includes(id));
    console.log(`[executeFulfillAsk] Ask(s) not found: ${missingIds.join(', ')}`);
    return { error: `Ask(s) not found: ${missingIds.join(', ')}` };
  }

  // Validate all asks
  for (const ask of asks) {
    if (ask.status !== 'open') {
      return { error: `Ask ${ask.id} is no longer open (status: ${ask.status})` };
    }
    if (ask.userId === userId) {
      return { error: `Cannot fulfill your own ask (ask ${ask.id})` };
    }
  }

  // Calculate total cost
  const totalCost = asks.reduce((sum, ask) => sum + Number(ask.sharesOffered) * Number(ask.pricePerShare), 0);

  // Check if buyer has enough cash
  const account = await prisma.account.findUnique({
    where: { userId },
  });

  if (!account) {
    return { error: 'Account not found' };
  }

  const availableCash = Number(account.cashBalance) - Number(account.reservedCash);
  if (totalCost > availableCash) {
    return { error: `Insufficient funds. Need $${totalCost}, have $${availableCash} available.` };
  }

  console.log(`[executeFulfillAsk] Validation passed. Total cost: $${totalCost}, Available cash: $${availableCash}`);

  // Execute all fulfillments in a single transaction
  const results = await prisma.$transaction(async (tx) => {
    // Double-check all asks are still open
    const currentAsks = await tx.ask.findMany({
      where: { id: { in: askIds } },
      select: { id: true, status: true },
    });

    for (const currentAsk of currentAsks) {
      if (currentAsk.status !== 'open') {
        throw new Error(`Ask ${currentAsk.id} was already fulfilled or cancelled`);
      }
    }

    const transactions = [];
    const sellerShareChanges = new Map<string, { companyId: number; sellerId: number; shares: bigint }>(); // key: userId-companyId
    const buyerShareChanges = new Map<number, bigint>(); // companyId -> shares to add
    const sellerCashChanges = new Map<number, number>(); // sellerId -> cash to add

    // Calculate all changes first
    for (const ask of asks) {
      // Track seller share changes
      const sellerKey = `${ask.userId}-${ask.companyId}`;
      const currentSellerData = sellerShareChanges.get(sellerKey);
      if (currentSellerData) {
        currentSellerData.shares += ask.sharesOffered;
      } else {
        sellerShareChanges.set(sellerKey, {
          companyId: ask.companyId,
          sellerId: ask.userId,
          shares: ask.sharesOffered,
        });
      }

      // Track buyer share changes
      const currentBuyerShares = buyerShareChanges.get(ask.companyId) || BigInt(0);
      buyerShareChanges.set(ask.companyId, currentBuyerShares + ask.sharesOffered);

      // Track seller cash changes
      const askCost = Number(ask.sharesOffered) * Number(ask.pricePerShare);
      const currentSellerCash = sellerCashChanges.get(ask.userId) || 0;
      sellerCashChanges.set(ask.userId, currentSellerCash + askCost);
    }

    // Apply seller share changes
    for (const [, data] of sellerShareChanges.entries()) {
      const updatedHolding = await tx.stockHolding.update({
        where: {
          userId_companyId: { userId: data.sellerId, companyId: data.companyId },
        },
        data: {
          sharesOwned: { decrement: data.shares },
          reservedShares: { decrement: data.shares },
        },
      });

      // Delete holding if shares reached 0
      if (updatedHolding.sharesOwned === BigInt(0)) {
        await tx.stockHolding.delete({
          where: {
            userId_companyId: { userId: data.sellerId, companyId: data.companyId },
          },
        });
      }
    }

    // Apply buyer share changes
    for (const [companyId, sharesToAdd] of buyerShareChanges.entries()) {
      await tx.stockHolding.upsert({
        where: {
          userId_companyId: { userId, companyId },
        },
        create: {
          userId,
          companyId,
          sharesOwned: sharesToAdd,
          reservedShares: 0,
        },
        update: { sharesOwned: { increment: sharesToAdd } },
      });
    }

    // Update buyer account (subtract total cost)
    await tx.account.update({
      where: { userId },
      data: { cashBalance: { decrement: totalCost } },
    });

    // Update seller accounts (add cash for each seller)
    for (const [sellerId, cashToAdd] of sellerCashChanges.entries()) {
      await tx.account.update({
        where: { userId: sellerId },
        data: { cashBalance: { increment: cashToAdd } },
      });
    }

    // Mark all asks as fulfilled
    await tx.ask.updateMany({
      where: { id: { in: askIds } },
      data: { status: 'fulfilled' },
    });

    // Create transactions for each ask
    for (const ask of asks) {
      const company = await tx.company.findUnique({
        where: { id: ask.companyId },
        select: { splitMultiplier: true },
      });

      const askCost = Number(ask.sharesOffered) * Number(ask.pricePerShare);

      const transaction = await tx.transaction.create({
        data: {
          buyerId: userId,
          sellerId: ask.userId,
          companyId: ask.companyId,
          sharesTraded: ask.sharesOffered,
          pricePerShare: ask.pricePerShare,
          totalAmount: askCost,
          askId: ask.id,
          transactionType: 'ask_fulfillment',
          splitMultiplier: company?.splitMultiplier ?? 1.0,
        },
      });

      transactions.push({
        transactionId: transaction.id,
        askId: ask.id,
        ticker: ask.company.tickerSymbol,
        sharesBought: Number(ask.sharesOffered),
        pricePerShare: Number(ask.pricePerShare),
        cashSpent: askCost,
      });
    }

    return { transactions, totalCost };
  });

  console.log(`[executeFulfillAsk] Successfully fulfilled ${askIds.length} ask(s). Total cost: $${results.totalCost}`);

  return {
    success: true,
    fulfillments: results.transactions,
    totalCashSpent: results.totalCost,
  };
}

export async function executeCancelBid(userId: number, bidIds: number[]) {
  if (!bidIds || bidIds.length === 0) {
    return { error: 'No bid IDs provided. Must provide array of one or more bid IDs.' };
  }

  // Fetch all bids
  const bids = await prisma.bid.findMany({
    where: { id: { in: bidIds } },
  });

  if (bids.length !== bidIds.length) {
    const foundIds = bids.map(b => b.id);
    const missingIds = bidIds.filter(id => !foundIds.includes(id));
    return { error: `Bid(s) not found: ${missingIds.join(', ')}` };
  }

  // Validate all bids
  for (const bid of bids) {
    if (bid.status !== 'open') {
      return { error: `Bid ${bid.id} is no longer open` };
    }
    if (bid.userId !== userId) {
      return { error: `You can only cancel your own bids (bid ${bid.id})` };
    }
  }

  // Calculate total cash to unreserve
  const totalCashToUnreserve = bids.reduce((sum, bid) => sum + Number(bid.totalCost), 0);

  // Cancel all bids in a transaction
  await prisma.$transaction(async (tx) => {
    // Unreserve total cash
    await tx.account.update({
      where: { userId },
      data: { reservedCash: { decrement: totalCashToUnreserve } },
    });

    // Cancel all bids
    await tx.bid.updateMany({
      where: { id: { in: bidIds } },
      data: { status: 'cancelled' },
    });
  });

  const account = await prisma.account.findUnique({
    where: { userId },
  });

  return {
    success: true,
    cancelledBids: bids.map(b => ({ bidId: b.id, cashUnreserved: Number(b.totalCost) })),
    totalCashUnreserved: totalCashToUnreserve,
    newAvailableCash: account
      ? Number(account.cashBalance) - Number(account.reservedCash)
      : 0,
  };
}

export async function executeCancelAsk(userId: number, askIds: number[]) {
  if (!askIds || askIds.length === 0) {
    return { error: 'No ask IDs provided. Must provide array of one or more ask IDs.' };
  }

  // Fetch all asks
  const asks = await prisma.ask.findMany({
    where: { id: { in: askIds } },
    include: { company: true },
  });

  if (asks.length !== askIds.length) {
    const foundIds = asks.map(a => a.id);
    const missingIds = askIds.filter(id => !foundIds.includes(id));
    return { error: `Ask(s) not found: ${missingIds.join(', ')}` };
  }

  // Validate all asks
  for (const ask of asks) {
    if (ask.status !== 'open') {
      return { error: `Ask ${ask.id} is no longer open` };
    }
    if (ask.userId !== userId) {
      return { error: `You can only cancel your own asks (ask ${ask.id})` };
    }
  }

  // Group shares by company
  const sharesByCompany = new Map<number, bigint>();
  for (const ask of asks) {
    const current = sharesByCompany.get(ask.companyId) || BigInt(0);
    sharesByCompany.set(ask.companyId, current + ask.sharesOffered);
  }

  // Cancel all asks in a transaction
  await prisma.$transaction(async (tx) => {
    // Unreserve shares for each company
    for (const [companyId, shares] of sharesByCompany.entries()) {
      await tx.stockHolding.update({
        where: {
          userId_companyId: { userId, companyId },
        },
        data: { reservedShares: { decrement: shares } },
      });
    }

    // Cancel all asks
    await tx.ask.updateMany({
      where: { id: { in: askIds } },
      data: { status: 'cancelled' },
    });
  });

  return {
    success: true,
    cancelledAsks: asks.map(a => ({
      askId: a.id,
      ticker: a.company.tickerSymbol,
      sharesUnreserved: Number(a.sharesOffered),
    })),
  };
}

export async function executeGetMyOpenOrders(userId: number) {
  const [bids, asks] = await Promise.all([
    prisma.bid.findMany({
      where: { userId, status: 'open' },
      include: { company: { select: { tickerSymbol: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.ask.findMany({
      where: { userId, status: 'open' },
      include: { company: { select: { tickerSymbol: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    bids: bids.map((b) => ({
      bidId: b.id,
      ticker: b.company.tickerSymbol,
      shares: Number(b.sharesRequested),
      pricePerShare: Number(b.pricePerShare),
      totalCost: Number(b.totalCost),
      createdAt: b.createdAt.toISOString(),
    })),
    asks: asks.map((a) => ({
      askId: a.id,
      ticker: a.company.tickerSymbol,
      shares: Number(a.sharesOffered),
      pricePerShare: Number(a.pricePerShare),
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

// Main tool executor
export async function executeTool(userId: number, toolName: string, args: Record<string, unknown>) {
  console.log(`[executeTool] User ${userId} calling ${toolName} with args:`, JSON.stringify(args));

  switch (toolName) {
    case 'get_my_portfolio':
      return executeGetMyPortfolio(userId);
    case 'get_user_portfolio':
      return executeGetUserPortfolio(args.username as string);
    case 'get_companies':
      return executeGetCompanies();
    case 'get_company_details':
      return executeGetCompanyDetails(args.ticker as string);
    case 'get_order_book':
      return executeGetOrderBook(args.ticker as string | undefined);
    case 'get_recent_transactions':
      return executeGetRecentTransactions(
        args.ticker as string | undefined,
        args.username as string | undefined,
        args.limit as number | undefined
      );
    case 'get_posts':
      return executeGetPosts(args.ticker as string | undefined, args.limit as number | undefined);
    case 'place_bid':
      return executePlaceBid(userId, args.bids as Array<{ ticker: string; shares: number; pricePerShare: number }>);
    case 'place_ask':
      return executePlaceAsk(userId, args.asks as Array<{ ticker: string; shares: number; pricePerShare: number }>);
    case 'fulfill_bid':
      return executeFulfillBid(userId, args.bidIds as number[]);
    case 'fulfill_ask':
      return executeFulfillAsk(userId, args.askIds as number[]);
    case 'cancel_bid':
      return executeCancelBid(userId, args.bidIds as number[]);
    case 'cancel_ask':
      return executeCancelAsk(userId, args.askIds as number[]);
    case 'get_my_open_orders':
      return executeGetMyOpenOrders(userId);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
