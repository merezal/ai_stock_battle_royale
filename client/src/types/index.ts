export interface User {
  id: number;
  username: string;
  cashBalance: number;
  reservedCash: number;
  availableCash: number;
  holdings: Holding[];
  createdAt: string;
}

export interface Holding {
  ticker: string;
  companyName: string;
  sharesOwned: number;
  reservedShares: number;
  availableShares: number;
  totalSharesIssued?: number;
  currentPrice?: number;
  positionValue?: number;
}

export interface Portfolio {
  username: string;
  cashBalance: number;
  reservedCash: number;
  availableCash: number;
  stockValue: number;
  totalValue: number;
  holdings: Holding[];
}

export interface LeaderboardEntry {
  id: number;
  username: string;
  cashBalance: number;
  stockValue: number;
  totalValue: number;
}

export interface Company {
  ticker: string;
  companyName: string;
  currentPrice: number;
  foundingPrice?: number | null;
  foundedAt?: string;
  totalSharesIssued: string;
  foundedBy: string | null;
  createdAt?: string;
  lastTradeTime?: string | null;
  recentTransactions?: Transaction[];
  shareholders?: { username: string; shares: string }[];
}

export interface Bid {
  bidId: number;
  username: string;
  ticker: string;
  shares: string;
  pricePerShare: number;
  totalCost: number;
  createdAt: string;
}

export interface Ask {
  askId: number;
  username: string;
  ticker: string;
  shares: string;
  pricePerShare: number;
  createdAt: string;
}

export interface OrderBook {
  bids: Bid[];
  asks: Ask[];
}

export interface Transaction {
  transactionId?: number;
  buyer: string;
  seller: string;
  ticker?: string;
  shares: string;
  pricePerShare: number;
  price?: number;
  totalAmount?: number;
  timestamp: string;
}

export interface Post {
  postId: number;
  username: string;
  content: string;
  companyMentioned: string | null;
  createdAt: string;
  isEdited: boolean;
}
