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
    description: 'Place a buy order (bid) for shares of a stock. This reserves your cash until the order is fulfilled or cancelled.',
    parameters: {
      type: 'object',
      properties: {
        ticker: {
          type: 'string',
          description: 'The stock ticker symbol',
        },
        shares: {
          type: 'number',
          description: 'Number of shares to buy',
        },
        pricePerShare: {
          type: 'number',
          description: 'Maximum price per share you are willing to pay',
        },
      },
      required: ['ticker', 'shares', 'pricePerShare'],
    },
  },
  {
    name: 'place_ask',
    description: 'Place a sell order (ask) for shares you own. This reserves your shares until the order is fulfilled or cancelled.',
    parameters: {
      type: 'object',
      properties: {
        ticker: {
          type: 'string',
          description: 'The stock ticker symbol',
        },
        shares: {
          type: 'number',
          description: 'Number of shares to sell',
        },
        pricePerShare: {
          type: 'number',
          description: 'Minimum price per share you want to receive',
        },
      },
      required: ['ticker', 'shares', 'pricePerShare'],
    },
  },
  {
    name: 'fulfill_bid',
    description: 'Sell your shares to fulfill someone else\'s buy order. You receive cash immediately.',
    parameters: {
      type: 'object',
      properties: {
        bidId: {
          type: 'number',
          description: 'The ID of the bid to fulfill',
        },
      },
      required: ['bidId'],
    },
  },
  {
    name: 'fulfill_ask',
    description: 'Buy shares from someone else\'s sell order. You pay the ask price immediately.',
    parameters: {
      type: 'object',
      properties: {
        askId: {
          type: 'number',
          description: 'The ID of the ask to fulfill',
        },
      },
      required: ['askId'],
    },
  },
  {
    name: 'cancel_bid',
    description: 'Cancel one of your open buy orders to get your reserved cash back',
    parameters: {
      type: 'object',
      properties: {
        bidId: {
          type: 'number',
          description: 'The ID of the bid to cancel',
        },
      },
      required: ['bidId'],
    },
  },
  {
    name: 'cancel_ask',
    description: 'Cancel one of your open sell orders to get your reserved shares back',
    parameters: {
      type: 'object',
      properties: {
        askId: {
          type: 'number',
          description: 'The ID of the ask to cancel',
        },
      },
      required: ['askId'],
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

// Helper to get current price for a company
async function getCurrentPrice(companyId: number, foundingCost: number | null, totalShares: bigint): Promise<number> {
  const lastTransaction = await prisma.transaction.findFirst({
    where: { companyId },
    orderBy: { timestamp: 'desc' },
  });

  if (lastTransaction) {
    return Number(lastTransaction.pricePerShare);
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

export async function executePlaceBid(userId: number, ticker: string, shares: number, pricePerShare: number) {
  const shareCount = BigInt(shares);
  const totalCost = shares * pricePerShare;

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
    return { error: 'User not found' };
  }

  if (!company) {
    return { error: `Company '${ticker}' not found` };
  }

  const availableCash = Number(user.account.cashBalance) - Number(user.account.reservedCash);
  if (totalCost > availableCash) {
    return { error: `Insufficient funds. Need $${totalCost}, have $${availableCash} available.` };
  }

  const bid = await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { userId },
      data: { reservedCash: { increment: totalCost } },
    });

    return tx.bid.create({
      data: {
        userId,
        companyId: company.id,
        sharesRequested: shareCount,
        pricePerShare,
        totalCost,
        status: 'open',
      },
    });
  });

  return {
    success: true,
    bidId: bid.id,
    ticker: ticker.toUpperCase(),
    shares,
    pricePerShare,
    totalCost,
    remainingAvailableCash: availableCash - totalCost,
  };
}

export async function executePlaceAsk(userId: number, ticker: string, shares: number, pricePerShare: number) {
  const shareCount = BigInt(shares);

  const company = await prisma.company.findUnique({
    where: { tickerSymbol: ticker.toUpperCase() },
  });

  if (!company) {
    return { error: `Company '${ticker}' not found` };
  }

  const holding = await prisma.stockHolding.findUnique({
    where: {
      userId_companyId: { userId, companyId: company.id },
    },
  });

  if (!holding) {
    return { error: `You do not own any shares of ${ticker}` };
  }

  const availableShares = Number(holding.sharesOwned) - Number(holding.reservedShares);
  if (shares > availableShares) {
    return { error: `Insufficient shares. Trying to sell ${shares}, only have ${availableShares} available.` };
  }

  const ask = await prisma.$transaction(async (tx) => {
    await tx.stockHolding.update({
      where: {
        userId_companyId: { userId, companyId: company.id },
      },
      data: { reservedShares: { increment: shareCount } },
    });

    return tx.ask.create({
      data: {
        userId,
        companyId: company.id,
        sharesOffered: shareCount,
        pricePerShare,
        status: 'open',
      },
    });
  });

  return {
    success: true,
    askId: ask.id,
    ticker: ticker.toUpperCase(),
    shares,
    pricePerShare,
    remainingAvailableShares: availableShares - shares,
  };
}

export async function executeFulfillBid(userId: number, bidId: number) {
  const bid = await prisma.bid.findUnique({
    where: { id: bidId },
    include: { company: true },
  });

  if (!bid) {
    return { error: 'Bid not found' };
  }

  if (bid.status !== 'open') {
    return { error: 'Bid is no longer open' };
  }

  if (bid.userId === userId) {
    return { error: 'Cannot fulfill your own bid' };
  }

  const holding = await prisma.stockHolding.findUnique({
    where: {
      userId_companyId: { userId, companyId: bid.companyId },
    },
  });

  const availableShares = holding
    ? Number(holding.sharesOwned) - Number(holding.reservedShares)
    : 0;

  if (Number(bid.sharesRequested) > availableShares) {
    return { error: `You don't own enough shares. Need ${bid.sharesRequested}, have ${availableShares}.` };
  }

  const transaction = await prisma.$transaction(async (tx) => {
    const updatedSellerHolding = await tx.stockHolding.update({
      where: {
        userId_companyId: { userId, companyId: bid.companyId },
      },
      data: { sharesOwned: { decrement: bid.sharesRequested } },
    });

    // Delete holding if shares reached 0
    if (Number(updatedSellerHolding.sharesOwned) === 0) {
      await tx.stockHolding.delete({
        where: {
          userId_companyId: { userId, companyId: bid.companyId },
        },
      });
    }

    await tx.stockHolding.upsert({
      where: {
        userId_companyId: { userId: bid.userId, companyId: bid.companyId },
      },
      create: {
        userId: bid.userId,
        companyId: bid.companyId,
        sharesOwned: bid.sharesRequested,
        reservedShares: 0,
      },
      update: { sharesOwned: { increment: bid.sharesRequested } },
    });

    await tx.account.update({
      where: { userId: bid.userId },
      data: {
        cashBalance: { decrement: Number(bid.totalCost) },
        reservedCash: { decrement: Number(bid.totalCost) },
      },
    });

    await tx.account.update({
      where: { userId },
      data: { cashBalance: { increment: Number(bid.totalCost) } },
    });

    await tx.bid.update({
      where: { id: bidId },
      data: { status: 'fulfilled' },
    });

    return tx.transaction.create({
      data: {
        buyerId: bid.userId,
        sellerId: userId,
        companyId: bid.companyId,
        sharesTraded: bid.sharesRequested,
        pricePerShare: bid.pricePerShare,
        totalAmount: bid.totalCost,
        bidId: bid.id,
        transactionType: 'bid_fulfillment',
      },
    });
  });

  return {
    success: true,
    transactionId: transaction.id,
    ticker: bid.company.tickerSymbol,
    sharesSold: Number(transaction.sharesTraded),
    pricePerShare: Number(transaction.pricePerShare),
    cashReceived: Number(transaction.totalAmount),
  };
}

export async function executeFulfillAsk(userId: number, askId: number) {
  const ask = await prisma.ask.findUnique({
    where: { id: askId },
    include: { company: true },
  });

  if (!ask) {
    return { error: 'Ask not found' };
  }

  if (ask.status !== 'open') {
    return { error: 'Ask is no longer open' };
  }

  if (ask.userId === userId) {
    return { error: 'Cannot fulfill your own ask' };
  }

  const totalCost = Number(ask.sharesOffered) * Number(ask.pricePerShare);

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

  const transaction = await prisma.$transaction(async (tx) => {
    const updatedSellerHolding = await tx.stockHolding.update({
      where: {
        userId_companyId: { userId: ask.userId, companyId: ask.companyId },
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
          userId_companyId: { userId: ask.userId, companyId: ask.companyId },
        },
      });
    }

    await tx.stockHolding.upsert({
      where: {
        userId_companyId: { userId, companyId: ask.companyId },
      },
      create: {
        userId,
        companyId: ask.companyId,
        sharesOwned: ask.sharesOffered,
        reservedShares: 0,
      },
      update: { sharesOwned: { increment: ask.sharesOffered } },
    });

    await tx.account.update({
      where: { userId },
      data: { cashBalance: { decrement: totalCost } },
    });

    await tx.account.update({
      where: { userId: ask.userId },
      data: { cashBalance: { increment: totalCost } },
    });

    await tx.ask.update({
      where: { id: askId },
      data: { status: 'fulfilled' },
    });

    return tx.transaction.create({
      data: {
        buyerId: userId,
        sellerId: ask.userId,
        companyId: ask.companyId,
        sharesTraded: ask.sharesOffered,
        pricePerShare: ask.pricePerShare,
        totalAmount: totalCost,
        askId: ask.id,
        transactionType: 'ask_fulfillment',
      },
    });
  });

  return {
    success: true,
    transactionId: transaction.id,
    ticker: ask.company.tickerSymbol,
    sharesBought: Number(transaction.sharesTraded),
    pricePerShare: Number(transaction.pricePerShare),
    cashSpent: Number(transaction.totalAmount),
  };
}

export async function executeCancelBid(userId: number, bidId: number) {
  const bid = await prisma.bid.findUnique({
    where: { id: bidId },
  });

  if (!bid) {
    return { error: 'Bid not found' };
  }

  if (bid.status !== 'open') {
    return { error: 'Bid is no longer open' };
  }

  if (bid.userId !== userId) {
    return { error: 'You can only cancel your own bids' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { userId },
      data: { reservedCash: { decrement: Number(bid.totalCost) } },
    });

    await tx.bid.update({
      where: { id: bidId },
      data: { status: 'cancelled' },
    });
  });

  const account = await prisma.account.findUnique({
    where: { userId },
  });

  return {
    success: true,
    cashUnreserved: Number(bid.totalCost),
    newAvailableCash: account
      ? Number(account.cashBalance) - Number(account.reservedCash)
      : 0,
  };
}

export async function executeCancelAsk(userId: number, askId: number) {
  const ask = await prisma.ask.findUnique({
    where: { id: askId },
    include: { company: true },
  });

  if (!ask) {
    return { error: 'Ask not found' };
  }

  if (ask.status !== 'open') {
    return { error: 'Ask is no longer open' };
  }

  if (ask.userId !== userId) {
    return { error: 'You can only cancel your own asks' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.stockHolding.update({
      where: {
        userId_companyId: { userId, companyId: ask.companyId },
      },
      data: { reservedShares: { decrement: ask.sharesOffered } },
    });

    await tx.ask.update({
      where: { id: askId },
      data: { status: 'cancelled' },
    });
  });

  const holding = await prisma.stockHolding.findUnique({
    where: {
      userId_companyId: { userId, companyId: ask.companyId },
    },
  });

  return {
    success: true,
    sharesUnreserved: Number(ask.sharesOffered),
    newAvailableShares: holding
      ? Number(holding.sharesOwned) - Number(holding.reservedShares)
      : 0,
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
      return executePlaceBid(
        userId,
        args.ticker as string,
        args.shares as number,
        args.pricePerShare as number
      );
    case 'place_ask':
      return executePlaceAsk(
        userId,
        args.ticker as string,
        args.shares as number,
        args.pricePerShare as number
      );
    case 'fulfill_bid':
      return executeFulfillBid(userId, args.bidId as number);
    case 'fulfill_ask':
      return executeFulfillAsk(userId, args.askId as number);
    case 'cancel_bid':
      return executeCancelBid(userId, args.bidId as number);
    case 'cancel_ask':
      return executeCancelAsk(userId, args.askId as number);
    case 'get_my_open_orders':
      return executeGetMyOpenOrders(userId);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
