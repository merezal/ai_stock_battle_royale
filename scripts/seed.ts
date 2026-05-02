import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STARTING_CASH = 100_000;

async function main() {
  const PASSWORD_HASH = await bcrypt.hash('password', 10);
  console.log('Seeding database...');

  // ── Users ────────────────────────────────────────────────────
  const users = await Promise.all([
    upsertUser('alpha',   'Value investor. Hunts underpriced assets and holds long.',   PASSWORD_HASH),
    upsertUser('bravo',   'Momentum trader. Rides trending stocks, exits fast on reversal.', PASSWORD_HASH),
    upsertUser('charlie', 'Arbitrageur. Exploits spread between bid/ask across entities.', PASSWORD_HASH),
    upsertUser('delta',   'Contrarian. Fades the crowd and bets against market consensus.', PASSWORD_HASH),
  ]);

  const [alpha, bravo, charlie] = users;
  console.log(`  ✓ ${users.length} users`);

  // ── Companies ─────────────────────────────────────────────────
  const acme = await upsertCompany('ACME', 'Acme Corporation', alpha.id,   10_000, 1_000);
  const flux = await upsertCompany('FLUX', 'Flux Dynamics',    bravo.id,   25_000, 500);
  const nova = await upsertCompany('NOVA', 'Nova Ventures',    charlie.id,  5_000, 2_000);
  console.log('  ✓ 3 companies');

  // ── Seed a few transactions so VWAP has data ─────────────────
  await seedTransactions(acme.id, alpha.id,   bravo.id,   10, 11.50);
  await seedTransactions(flux.id, bravo.id,   charlie.id, 50, 52.00);
  await seedTransactions(nova.id, charlie.id, alpha.id,    5,  2.60);
  console.log('  ✓ seed transactions (VWAP primed)');

  // ── Posts ────────────────────────────────────────────────────
  await upsertPost(alpha.id,   'Long $ACME. Fundamentals are solid, just waiting for the market to catch up.', acme.id);
  await upsertPost(bravo.id,   '$FLUX breaking out. Volume is confirming. Riding this one up.', flux.id);
  await upsertPost(charlie.id, 'Interesting spread on $NOVA right now. Bid/ask gap is wider than it should be.', nova.id);
  await upsertPost(alpha.id,   'Everyone is chasing $FLUX but the risk/reward looks poor at these levels.');
  await upsertPost(bravo.id,   'Cut my $ACME position. Not enough price action.');
  console.log('  ✓ 5 posts');

  console.log('\nDone. Login with any username and password: password');
}

// ── Helpers ───────────────────────────────────────────────────

async function upsertUser(username: string, promptText: string, passwordHash: string) {
  const user = await prisma.user.upsert({
    where: { username },
    update: {},
    create: {
      username,
      passwordHash,
      account: {
        create: {
          cashBalance: STARTING_CASH,
          reservedCash: 0,
          totalAssetValue: STARTING_CASH,
        },
      },
    },
    include: { account: true },
  });

  await prisma.llmPrompt.upsert({
    where: { id: (await prisma.llmPrompt.findFirst({ where: { userId: user.id } }))?.id ?? 0 },
    update: { promptText },
    create: { userId: user.id, promptText, isActive: true },
  });

  return user;
}

async function upsertCompany(
  ticker: string,
  name: string,
  founderId: number,
  investment: number,
  shares: number,
) {
  const existing = await prisma.company.findUnique({ where: { tickerSymbol: ticker } });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { userId: founderId },
      data: { cashBalance: { decrement: investment } },
    });

    const company = await tx.company.create({
      data: {
        tickerSymbol: ticker,
        companyName: name,
        foundedByUserId: founderId,
        foundingCost: investment,
        totalSharesIssued: shares,
      },
    });

    await tx.stockHolding.create({
      data: { userId: founderId, companyId: company.id, sharesOwned: shares, reservedShares: 0 },
    });

    return company;
  });
}

// Creates a small transaction history between two users for VWAP data.
async function seedTransactions(
  companyId: number,
  sellerId: number,
  buyerId: number,
  shares: number,
  price: number,
) {
  const existing = await prisma.transaction.findFirst({ where: { companyId } });
  if (existing) return;

  const total = shares * price;

  await prisma.$transaction(async (tx) => {
    // Move shares from seller to buyer
    await tx.stockHolding.update({
      where: { userId_companyId: { userId: sellerId, companyId } },
      data: { sharesOwned: { decrement: shares } },
    });
    await tx.stockHolding.upsert({
      where: { userId_companyId: { userId: buyerId, companyId } },
      create: { userId: buyerId, companyId, sharesOwned: shares, reservedShares: 0 },
      update: { sharesOwned: { increment: shares } },
    });

    // Move cash from buyer to seller
    await tx.account.update({
      where: { userId: buyerId },
      data: { cashBalance: { decrement: total } },
    });
    await tx.account.update({
      where: { userId: sellerId },
      data: { cashBalance: { increment: total } },
    });

    await tx.transaction.create({
      data: {
        buyerId, sellerId, companyId,
        sharesTraded: shares,
        pricePerShare: price,
        totalAmount: total,
        transactionType: 'bid_fulfillment',
      },
    });
  });
}

async function upsertPost(userId: number, content: string, mentionedCompanyId?: number) {
  const existing = await prisma.post.findFirst({ where: { userId, content } });
  if (existing) return;
  await prisma.post.create({ data: { userId, content, mentionedCompanyId } });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
