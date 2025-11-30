import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { cacheGet, cacheSet } from '../lib/redis.js';
import { TOKEN_TO_CENTS } from '@paya/shared';

const CACHE_KEY = 'transparency:dashboard';
const CACHE_TTL_SECONDS = 60; // Cache for 1 minute

export const transparencyRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /transparency
   * Get public transparency dashboard data (no auth required)
   */
  app.get('/', async () => {
    // Try cache first
    const cached = await cacheGet<TransparencyData>(CACHE_KEY);
    if (cached) {
      return {
        success: true,
        data: cached,
        cached: true,
      };
    }

    // Calculate fresh data
    const data = await calculateTransparencyData();

    // Cache the result
    await cacheSet(CACHE_KEY, data, CACHE_TTL_SECONDS);

    return {
      success: true,
      data,
      cached: false,
    };
  });

  /**
   * GET /transparency/history
   * Get historical weekly cycle data
   */
  app.get<{ Querystring: { limit?: string } }>('/history', async (request) => {
    const limit = Math.min(52, parseInt(request.query.limit || '12'));

    const cycles = await prisma.weeklyCycle.findMany({
      where: {
        status: { in: ['distributed', 'finalized'] },
      },
      orderBy: { weekNumber: 'desc' },
      take: limit,
    });

    return {
      success: true,
      data: cycles.map((cycle) => ({
        weekNumber: cycle.weekNumber,
        startsAt: cycle.startsAt,
        endsAt: cycle.endsAt,
        totalRevenue: Number(cycle.totalRevenue),
        opsAllocation: Number(cycle.opsAllocation),
        userPool: Number(cycle.userPool),
        activeUserCount: cycle.activeUserCount,
        perUserReward: Number(cycle.perUserReward),
        distributedAt: cycle.distributedAt,
      })),
    };
  });

  /**
   * GET /transparency/reserve
   * Get reserve balance history
   */
  app.get<{ Querystring: { limit?: string } }>('/reserve', async (request) => {
    const limit = Math.min(100, parseInt(request.query.limit || '30'));

    const snapshots = await prisma.reserveSnapshot.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return {
      success: true,
      data: snapshots.map((s) => ({
        reserveUsdCents: Number(s.reserveBalanceCents),
        totalTokens: Number(s.totalTokensCirculation),
        isBalanced: s.isBalanced,
        discrepancyCents: Number(s.discrepancyCents),
        createdAt: s.createdAt,
      })),
    };
  });
};

interface TransparencyData {
  reserve: {
    balanceUsd: number;
    totalTokens: number;
    isFullyBacked: boolean;
  };
  rewardsPool: {
    currentBalance: number; // Current accumulated fees (in dollars)
    activeUsers: number;    // Users eligible for this week
    estimatedReward: number; // Estimated per-user reward (floored)
  };
  lastWeek: {
    weekNumber: number;
    totalRevenue: number;
    opsAllocation: number;
    userPool: number;
    activeUserCount: number;
    perUserReward: number;
  } | null;
  network: {
    totalUsers: number;
    totalTransactions: number;
    totalVolumeTokens: number;
  };
  updatedAt: string;
}

async function calculateTransparencyData(): Promise<TransparencyData> {
  // Get latest reserve snapshot
  const latestReserve = await prisma.reserveSnapshot.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  // Calculate total tokens from all wallets
  const totalTokens = await prisma.wallet.aggregate({
    _sum: { balance: true },
  });

  // Get current week number
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(
    ((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
  );
  const currentWeekNumber = now.getFullYear() * 100 + weekNumber;

  // Get current week's cycle (open or calculating)
  const currentCycle = await prisma.weeklyCycle.findFirst({
    where: { 
      weekNumber: currentWeekNumber,
      status: { in: ['open', 'calculating', 'distributed'] },
    },
  });

  // Get last completed weekly cycle (for history)
  const lastCycle = await prisma.weeklyCycle.findFirst({
    where: { status: { in: ['distributed', 'finalized'] } },
    orderBy: { weekNumber: 'desc' },
  });

  // Count active users this week (users with public payments)
  const activeUsersThisWeek = await prisma.weeklyActivity.count({
    where: {
      weekNumber: currentWeekNumber,
      OR: [
        { publicPaymentsSent: { gt: 0 } },
        { publicPaymentsReceived: { gt: 0 } },
      ],
    },
  });

  // Network stats
  const [userCount, txStats] = await Promise.all([
    prisma.user.count({ where: { status: 'active' } }),
    prisma.transaction.aggregate({
      where: { status: 'completed', type: 'payment' },
      _count: true,
      _sum: { amount: true },
    }),
  ]);

  const totalTokensNum = Number(totalTokens._sum.balance || 0);

  // Calculate current pool balance and estimated reward
  const currentPoolCents = currentCycle ? Number(currentCycle.userPool) : 0;
  const currentPoolDollars = currentPoolCents / 100;
  const activeUsers = activeUsersThisWeek || (currentCycle?.activeUserCount || 0);
  const estimatedReward = activeUsers > 0 
    ? Math.floor(currentPoolDollars / activeUsers) 
    : 0;

  return {
    reserve: {
      balanceUsd: latestReserve 
        ? Number(latestReserve.reserveBalanceCents) / 100 
        : totalTokensNum, // Assume fully backed if no snapshot
      totalTokens: totalTokensNum,
      isFullyBacked: latestReserve?.isBalanced ?? true,
    },
    rewardsPool: {
      currentBalance: currentPoolDollars,
      activeUsers,
      estimatedReward,
    },
    lastWeek: lastCycle
      ? {
          weekNumber: lastCycle.weekNumber,
          totalRevenue: Number(lastCycle.totalRevenue) / 100, // Convert cents to dollars
          opsAllocation: Number(lastCycle.opsAllocation) / 100,
          userPool: Number(lastCycle.userPool) / 100, // Convert cents to dollars
          activeUserCount: lastCycle.activeUserCount,
          perUserReward: Math.floor(Number(lastCycle.perUserReward) / 100), // Floor to whole dollars
        }
      : null,
    network: {
      totalUsers: userCount,
      totalTransactions: txStats._count,
      totalVolumeTokens: Number(txStats._sum.amount || 0),
    },
    updatedAt: new Date().toISOString(),
  };
}

