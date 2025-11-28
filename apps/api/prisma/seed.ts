import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

function hashPhone(phone: string): string {
  const salt = process.env.PHONE_HASH_SALT || 'paya-phone-salt';
  return crypto.createHash('sha256').update(`${salt}:${phone}`).digest('hex');
}

async function main() {
  console.log('🌱 Seeding database...');

  // Create test users
  const testUsers = [
    { phone: '+11234567890', username: 'alice', balance: 1000 },
    { phone: '+10987654321', username: 'bob', balance: 500 },
    { phone: '+11111111111', username: 'charlie', balance: 250 },
    { phone: '+12222222222', username: 'diana', balance: 100 },
  ];

  for (const userData of testUsers) {
    const existingUser = await prisma.user.findUnique({
      where: { username: userData.username },
    });

    if (existingUser) {
      console.log(`  User @${userData.username} already exists, skipping`);
      continue;
    }

    const user = await prisma.user.create({
      data: {
        username: userData.username,
        phoneHash: hashPhone(userData.phone),
        phoneLastFour: userData.phone.slice(-4),
        status: 'active',
        flags: [],
      },
    });

    await prisma.wallet.create({
      data: {
        userId: user.id,
        balance: userData.balance,
        totalLoaded: userData.balance,
      },
    });

    console.log(`  Created user @${userData.username} with ${userData.balance} tokens`);
  }

  // Create initial weekly cycle
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const weekStart = new Date(now.setDate(diff));
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const weekNumber = getWeekNumber(new Date());
  
  const existingCycle = await prisma.weeklyCycle.findUnique({
    where: { weekNumber },
  });

  if (!existingCycle) {
    await prisma.weeklyCycle.create({
      data: {
        weekNumber,
        startsAt: weekStart,
        endsAt: weekEnd,
        status: 'open',
      },
    });
    console.log(`  Created weekly cycle ${weekNumber}`);
  }

  // Create some sample transactions between users
  const alice = await prisma.user.findUnique({ where: { username: 'alice' } });
  const bob = await prisma.user.findUnique({ where: { username: 'bob' } });
  
  if (alice && bob) {
    const existingTx = await prisma.transaction.findFirst({
      where: { fromUserId: alice.id, toUserId: bob.id },
    });

    if (!existingTx) {
      await prisma.transaction.create({
        data: {
          type: 'payment',
          status: 'completed',
          fromUserId: alice.id,
          toUserId: bob.id,
          amount: 25,
          memo: 'Thanks for lunch! 🍕',
          isPublic: true,
          completedAt: new Date(),
        },
      });
      console.log('  Created sample transaction: alice → bob (25 tokens)');
    }
  }

  // Create initial reserve snapshot
  const totalTokens = await prisma.wallet.aggregate({
    _sum: { balance: true },
  });

  const existingSnapshot = await prisma.reserveSnapshot.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  if (!existingSnapshot) {
    const totalBalance = Number(totalTokens._sum.balance || 0);
    await prisma.reserveSnapshot.create({
      data: {
        reserveBalanceCents: totalBalance * 100, // 1:1 backing
        totalTokensCirculation: totalBalance,
        isBalanced: true,
        discrepancyCents: 0,
        source: 'initial_seed',
      },
    });
    console.log(`  Created initial reserve snapshot (${totalBalance} tokens backed)`);
  }

  console.log('✅ Seed completed!');
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return d.getUTCFullYear() * 100 + weekNo;
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

