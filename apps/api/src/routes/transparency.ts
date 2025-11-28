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

  // Get last completed weekly cycle
  const lastCycle = await prisma.weeklyCycle.findFirst({
    where: { status: { in: ['distributed', 'finalized'] } },
    orderBy: { weekNumber: 'desc' },
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

  return {
    reserve: {
      balanceUsd: latestReserve 
        ? Number(latestReserve.reserveBalanceCents) / 100 
        : totalTokensNum, // Assume fully backed if no snapshot
      totalTokens: totalTokensNum,
      isFullyBacked: latestReserve?.isBalanced ?? true,
    },
    lastWeek: lastCycle
      ? {
          weekNumber: lastCycle.weekNumber,
          totalRevenue: Number(lastCycle.totalRevenue) / 100, // Convert cents to dollars
          opsAllocation: Number(lastCycle.opsAllocation) / 100,
          userPool: Number(lastCycle.userPool),
          activeUserCount: lastCycle.activeUserCount,
          perUserReward: Number(lastCycle.perUserReward),
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

