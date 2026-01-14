import { prisma } from './prisma';

// Number of recent transactions to include in VWAP calculation
const VWAP_TRANSACTION_LIMIT = 20;

export interface CompanyPriceInfo {
  companyId: number;
  foundingCost: number | null;
  totalSharesIssued: bigint;
  splitMultiplier: number;
}

/**
 * Calculate Volume-Weighted Average Price (VWAP) for a company.
 *
 * Split-adjusted VWAP formula derivation:
 *   - Adjusted price:  P_adj = P × (M_company / M_tx)
 *   - Adjusted volume: V_adj = V × (M_tx / M_company)
 *   - Note: P_adj × V_adj = P × V (multipliers cancel)
 *
 * Therefore:
 *   VWAP = Σ(P_adj × V_adj) / Σ(V_adj)
 *        = Σ(P × V) / Σ(V × M_tx / M_company)
 *        = Σ(P × V) × M_company / Σ(V × M_tx)
 *
 * When there are fewer than VWAP_TRANSACTION_LIMIT transactions, the founding
 * price is included as a "virtual transaction" to anchor the VWAP and prevent
 * manipulation. Once there are enough transactions, the market has established
 * a fair price and the founding cost is excluded.
 *
 * @param info - Company pricing information
 * @returns The VWAP (includes founding price if < 20 transactions)
 */
export async function getVWAPPrice(info: CompanyPriceInfo): Promise<number> {
  const { companyId, foundingCost, totalSharesIssued, splitMultiplier } = info;

  const transactions = await prisma.transaction.findMany({
    where: { companyId },
    orderBy: { timestamp: 'desc' },
    take: VWAP_TRANSACTION_LIMIT,
    select: {
      pricePerShare: true,
      sharesTraded: true,
      splitMultiplier: true,
    },
  });

  // VWAP = totalDollarValue × M_company / totalWeightedShares
  // where totalWeightedShares = Σ(volume × M_tx)
  let totalDollarValue = 0;
  let totalWeightedShares = 0;

  // Only include founding price when there aren't enough transactions.
  // Once we have VWAP_TRANSACTION_LIMIT (20) transactions, the market has
  // established the price and founding becomes irrelevant.
  //
  // Note: totalSharesIssued is the CURRENT share count (after splits).
  // Original shares = currentShares × currentMultiplier (since founding M = 1.0)
  const hasEnoughTrades = transactions.length >= VWAP_TRANSACTION_LIMIT;

  if (!hasEnoughTrades && foundingCost !== null) {
    const originalFoundingShares = Number(totalSharesIssued) * splitMultiplier;
    const foundingMultiplier = 1.0;
    totalDollarValue += foundingCost;
    totalWeightedShares += originalFoundingShares * foundingMultiplier;
  }

  // Add actual transactions
  for (const tx of transactions) {
    const price = Number(tx.pricePerShare);
    const volume = Number(tx.sharesTraded);
    const txMultiplier = Number(tx.splitMultiplier);

    totalDollarValue += price * volume;
    totalWeightedShares += volume * txMultiplier;
  }

  if (totalWeightedShares === 0) {
    // Edge case: no founding cost and no transactions (shouldn't happen)
    return 0;
  }

  return (totalDollarValue * splitMultiplier) / totalWeightedShares;
}

/**
 * Convenience function to get VWAP for a company by ID.
 * Fetches company data and calculates VWAP in one call.
 *
 * @param companyId - The company ID
 * @returns The VWAP, or null if company not found
 */
export async function getVWAPPriceById(companyId: number): Promise<number | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      foundingCost: true,
      totalSharesIssued: true,
      splitMultiplier: true,
    },
  });

  if (!company) {
    return null;
  }

  return getVWAPPrice({
    companyId: company.id,
    foundingCost: company.foundingCost ? Number(company.foundingCost) : null,
    totalSharesIssued: company.totalSharesIssued,
    splitMultiplier: Number(company.splitMultiplier),
  });
}
