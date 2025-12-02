/**
 * Test Data Generator for PaYa
 * 
 * Usage:
 *   pnpm test-data seed        # Generate test data
 *   pnpm test-data clear       # Clear all test data
 *   pnpm test-data reset       # Clear and regenerate
 * 
 * Environment:
 *   DATABASE_URL must be set
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Test user configuration
const TEST_USERS = [
  { username: 'alice', phone: '+15551234001', balance: 500 },
  { username: 'bob', phone: '+15551234002', balance: 250 },
  { username: 'charlie', phone: '+15551234003', balance: 1000 },
  { username: 'diana', phone: '+15551234004', balance: 100 },
  { username: 'evan', phone: '+15551234005', balance: 750 },
  { username: 'fiona', phone: '+15551234006', balance: 300 },
  { username: 'george', phone: '+15551234007', balance: 50 },
  { username: 'hannah', phone: '+15551234008', balance: 200 },
  { username: 'testuser', phone: '+15551230000', balance: 1000 },
  { username: 'demo', phone: '+15559990000', balance: 500 },
];

// Sample memos for transactions
const MEMOS = [
  'Coffee ☕',
  'Lunch 🍔',
  'Thanks!',
  'Happy birthday! 🎂',
  'Splitting dinner',
  'Movie tickets 🎬',
  'Uber ride',
  'Groceries',
  'Rent',
  'Beer money 🍺',
  'Concert tickets 🎵',
  'Pizza night 🍕',
  'Gym membership',
  'Netflix',
  'Road trip gas ⛽',
  null, // Some transactions have no memo
];

function hashPhone(phone: string): string {
  return crypto.createHash('sha256').update(phone).digest('hex');
}

function getLastFour(phone: string): string {
  return phone.slice(-4);
}

function randomMemo(): string | null {
  return MEMOS[Math.floor(Math.random() * MEMOS.length)];
}

function randomAmount(min: number = 1, max: number = 100): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(daysBack: number = 30): Date {
  const now = new Date();
  const pastDate = new Date(now.getTime() - Math.random() * daysBack * 24 * 60 * 60 * 1000);
  return pastDate;
}

function getWeekNumber(date: Date): number {
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const week = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return year * 100 + week;
}

async function clearTestData() {
  console.log('🗑️  Clearing test data...');
  
  // Delete in order of dependencies
  await prisma.ledgerEntry.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.pendingPayment.deleteMany({});
  await prisma.weeklyActivity.deleteMany({});
  await prisma.weeklyCycle.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.bankAccount.deleteMany({});
  await prisma.rateLimitCounter.deleteMany({});
  await prisma.wallet.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.reserveSnapshot.deleteMany({});
  await prisma.user.deleteMany({});
  
  console.log('✅ Test data cleared');
}

async function createUsers(): Promise<Map<string, { id: string; username: string }>> {
  console.log('👤 Creating test users...');
  
  const userMap = new Map<string, { id: string; username: string }>();
  
  for (const userData of TEST_USERS) {
    const phoneHash = hashPhone(userData.phone);
    const phoneLastFour = getLastFour(userData.phone);
    
    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { username: userData.username },
    });
    
    if (!user) {
      user = await prisma.user.create({
        data: {
          username: userData.username,
          phoneHash,
          phoneLastFour,
          status: 'active',
          flags: [],
          lastActiveAt: new Date(),
          wallet: {
            create: {
              balance: BigInt(userData.balance),
              totalLoaded: BigInt(userData.balance),
            },
          },
        },
      });
      console.log(`  ✓ Created user: @${userData.username} with $${userData.balance}`);
    } else {
      console.log(`  ⏭️  User @${userData.username} already exists`);
    }
    
    userMap.set(userData.username, { id: user.id, username: user.username });
  }
  
  return userMap;
}

async function createTransactions(userMap: Map<string, { id: string; username: string }>) {
  console.log('💸 Creating test transactions...');
  
  const users = Array.from(userMap.values());
  const transactionCount = 50; // Number of transactions to create
  
  for (let i = 0; i < transactionCount; i++) {
    // Pick random sender and receiver (different users)
    const senderIndex = Math.floor(Math.random() * users.length);
    let receiverIndex = Math.floor(Math.random() * users.length);
    while (receiverIndex === senderIndex) {
      receiverIndex = Math.floor(Math.random() * users.length);
    }
    
    const sender = users[senderIndex];
    const receiver = users[receiverIndex];
    const amount = randomAmount(1, 50);
    const memo = randomMemo();
    const isPublic = Math.random() > 0.2; // 80% public
    const createdAt = randomDate(30);
    
    // Create the transaction
    const tx = await prisma.transaction.create({
      data: {
        type: 'payment',
        status: 'completed',
        fromUserId: sender.id,
        toUserId: receiver.id,
        amount: BigInt(amount),
        memo,
        isPublic,
        idempotencyKey: `test-tx-${crypto.randomUUID()}`,
        createdAt,
        completedAt: createdAt,
      },
    });
    
    // Create ledger entries
    const senderWallet = await prisma.wallet.findUnique({ where: { userId: sender.id } });
    const receiverWallet = await prisma.wallet.findUnique({ where: { userId: receiver.id } });
    
    if (senderWallet && receiverWallet) {
      await prisma.ledgerEntry.createMany({
        data: [
          {
            transactionId: tx.id,
            walletId: senderWallet.id,
            entryType: 'debit',
            amount: BigInt(amount),
            balanceAfter: senderWallet.balance - BigInt(amount),
            createdAt,
          },
          {
            transactionId: tx.id,
            walletId: receiverWallet.id,
            entryType: 'credit',
            amount: BigInt(amount),
            balanceAfter: receiverWallet.balance + BigInt(amount),
            createdAt,
          },
        ],
      });
      
      // Update wallet stats (not balance, since we pre-set balances)
      await prisma.wallet.update({
        where: { id: senderWallet.id },
        data: { totalSent: { increment: BigInt(amount) } },
      });
      await prisma.wallet.update({
        where: { id: receiverWallet.id },
        data: { totalReceived: { increment: BigInt(amount) } },
      });
    }
  }
  
  console.log(`  ✓ Created ${transactionCount} transactions`);
}

async function createPendingPayments(userMap: Map<string, { id: string; username: string }>) {
  console.log('⏳ Creating pending payments...');
  
  const users = Array.from(userMap.values());
  const pendingPhones = [
    '+15559998001',
    '+15559998002',
    '+15559998003',
    '+15559998004',
    '+15559998005',
  ];
  
  for (const phone of pendingPhones) {
    const sender = users[Math.floor(Math.random() * users.length)];
    const amount = randomAmount(5, 50);
    const memo = randomMemo();
    
    await prisma.pendingPayment.create({
      data: {
        fromUserId: sender.id,
        toPhoneHash: hashPhone(phone),
        toPhoneLastFour: getLastFour(phone),
        amount: BigInt(amount),
        memo,
        isPublic: true,
        status: 'pending',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        inviteSentAt: new Date(),
        inviteCount: 1,
      },
    });
  }
  
  console.log(`  ✓ Created ${pendingPhones.length} pending payments`);
}

async function createWeeklyData(userMap: Map<string, { id: string; username: string }>) {
  console.log('📊 Creating weekly cycle data...');
  
  const users = Array.from(userMap.values());
  const now = new Date();
  const currentWeek = getWeekNumber(now);
  
  // Create current week cycle
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week (Sunday)
  weekStart.setHours(0, 0, 0, 0);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  
  await prisma.weeklyCycle.upsert({
    where: { weekNumber: currentWeek },
    update: {},
    create: {
      weekNumber: currentWeek,
      startsAt: weekStart,
      endsAt: weekEnd,
      totalRevenue: BigInt(1500), // $15 in fees collected
      opsAllocation: BigInt(150), // 10% to ops
      userPool: BigInt(1350), // Rest to user pool
      activeUserCount: users.length,
      perUserReward: BigInt(Math.floor(1350 / users.length)),
      status: 'open',
    },
  });
  
  // Create activity for each user
  for (const user of users) {
    const publicSent = Math.floor(Math.random() * 5);
    const publicReceived = Math.floor(Math.random() * 5);
    
    await prisma.weeklyActivity.upsert({
      where: {
        userId_weekNumber: {
          userId: user.id,
          weekNumber: currentWeek,
        },
      },
      update: {
        publicPaymentsSent: publicSent,
        publicPaymentsReceived: publicReceived,
        isEligible: publicSent >= 1,
      },
      create: {
        userId: user.id,
        weekNumber: currentWeek,
        publicPaymentsSent: publicSent,
        publicPaymentsReceived: publicReceived,
        isEligible: publicSent >= 1,
      },
    });
  }
  
  console.log(`  ✓ Created weekly cycle for week ${currentWeek}`);
}

async function createReserveSnapshot() {
  console.log('🏦 Creating reserve snapshot...');
  
  // Calculate total tokens in circulation
  const wallets = await prisma.wallet.findMany();
  const totalTokens = wallets.reduce((sum, w) => sum + w.balance, BigInt(0));
  
  await prisma.reserveSnapshot.create({
    data: {
      reserveBalanceCents: totalTokens * BigInt(100), // 1 token = $1 = 100 cents
      totalTokensCirculation: totalTokens,
      isBalanced: true,
      discrepancyCents: BigInt(0),
      source: 'test_data_generation',
    },
  });
  
  console.log(`  ✓ Created reserve snapshot (${totalTokens} tokens in circulation)`);
}

async function createSessions(userMap: Map<string, { id: string; username: string }>) {
  console.log('🔐 Creating test sessions...');
  
  // Create a session for each user (so they can be logged in via dev endpoints)
  for (const [username, user] of userMap) {
    const tokenHash = crypto.createHash('sha256')
      .update(`test-session-${username}-${Date.now()}`)
      .digest('hex');
    
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        deviceId: 'test-device',
        deviceName: 'Test Device',
        devicePlatform: 'android',
        isActive: true,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });
  }
  
  console.log(`  ✓ Created sessions for ${userMap.size} users`);
}

async function printSummary() {
  console.log('\n📋 Data Summary:');
  
  const userCount = await prisma.user.count();
  const txCount = await prisma.transaction.count();
  const pendingCount = await prisma.pendingPayment.count();
  const sessionCount = await prisma.session.count();
  
  console.log(`  • Users: ${userCount}`);
  console.log(`  • Transactions: ${txCount}`);
  console.log(`  • Pending Payments: ${pendingCount}`);
  console.log(`  • Sessions: ${sessionCount}`);
  
  console.log('\n👤 Test Users (use /dev/login/:username to log in):');
  for (const user of TEST_USERS) {
    console.log(`  • @${user.username} (${user.phone}) - $${user.balance}`);
  }
}

async function seedTestData() {
  console.log('🌱 Seeding test data...\n');
  
  const userMap = await createUsers();
  await createTransactions(userMap);
  await createPendingPayments(userMap);
  await createWeeklyData(userMap);
  await createReserveSnapshot();
  await createSessions(userMap);
  
  await printSummary();
  
  console.log('\n✅ Test data seeding complete!');
}

async function main() {
  const command = process.argv[2] || 'seed';
  
  console.log('═══════════════════════════════════════════');
  console.log('  PaYa Test Data Generator');
  console.log('═══════════════════════════════════════════\n');
  
  try {
    switch (command) {
      case 'seed':
        await seedTestData();
        break;
      case 'clear':
        await clearTestData();
        break;
      case 'reset':
        await clearTestData();
        console.log('');
        await seedTestData();
        break;
      default:
        console.log('Usage: pnpm test-data [seed|clear|reset]');
        console.log('  seed  - Generate test data');
        console.log('  clear - Remove all test data');
        console.log('  reset - Clear and regenerate');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

