import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { generateOtp } from '../lib/utils.js';
import { storeOtp, getOtp } from '../lib/redis.js';
import { SESSION } from '@paya/shared';

/**
 * Development-only routes for testing
 * These routes bypass authentication for easy dashboard testing
 */
export const devRoutes: FastifyPluginAsync = async (app) => {
  // Only enable in development
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  /**
   * GET /dev/otp/:phone
   * Get the currently stored OTP for a phone number (dev only)
   */
  app.get<{ Params: { phone: string } }>('/otp/:phone', async (request, reply) => {
    const { phone } = request.params;
    let otp = await getOtp(phone);

    // Try adding + if missing
    if (!otp && !phone.startsWith('+')) {
      otp = await getOtp(`+${phone}`);
    }
    
    // Try adding +1 if missing and length is 10 (US number)
    if (!otp && phone.length === 10 && /^\d+$/.test(phone)) {
      otp = await getOtp(`+1${phone}`);
    }

    if (!otp) {
      return reply.status(404).send({
        success: false,
        error: { message: 'No OTP found for this phone number' },
      });
    }

    return {
      success: true,
      data: {
        phone,
        otp,
        message: 'Use this OTP with /auth/verify-otp',
      },
    };
  });

  /**
   * POST /dev/otp/:phone
   * Generate and return an OTP for testing (dev only)
   * This lets you test the real auth flow without needing SMS
   */
  app.post<{ Params: { phone: string } }>('/otp/:phone', async (request) => {
    const phone = decodeURIComponent(request.params.phone);
    const otp = generateOtp();
    
    await storeOtp(phone, otp, SESSION.OTP_EXPIRY_SECONDS);
    
    request.log.info({ phone, otp }, '[DEV] OTP generated');
    
    return {
      success: true,
      data: {
        phone,
        otp,  // Returns the OTP directly in dev mode!
        expiresIn: SESSION.OTP_EXPIRY_SECONDS,
        message: 'Use this OTP with /auth/verify-otp or /auth/register',
      },
    };
  });

  /**
   * GET /dev/users
   * List all users with their balances (no auth required in dev)
   */
  app.get('/users', async () => {
    const users = await prisma.user.findMany({
      include: { wallet: true },
      orderBy: { username: 'asc' },
    });

    return {
      success: true,
      data: users.map((u) => ({
        id: u.id,
        username: u.username,
        status: u.status,
        balance: Number(u.wallet?.balance || 0),
        totalSent: Number(u.wallet?.totalSent || 0),
        totalReceived: Number(u.wallet?.totalReceived || 0),
        createdAt: u.createdAt,
      })),
    };
  });

  /**
   * POST /dev/login/:username
   * Login as any user without OTP (dev only)
   */
  app.post<{ Params: { username: string } }>('/login/:username', async (request, reply) => {
    const { username } = request.params;

    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      include: { wallet: true },
    });

    if (!user) {
      return reply.status(404).send({
        success: false,
        error: { message: 'User not found' },
      });
    }

    // Generate JWT directly
    const accessToken = app.jwt.sign({
      userId: user.id,
      username: user.username,
    });

    return {
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          status: user.status,
        },
        wallet: {
          balance: Number(user.wallet?.balance || 0),
        },
        accessToken,
      },
    };
  });

  /**
   * GET /dev/transactions
   * Get all recent transactions (no auth required in dev)
   */
  app.get<{
    Querystring: { limit?: string };
  }>('/transactions', async (request) => {
    const limit = Math.min(100, parseInt(request.query.limit || '50'));

    const transactions = await prisma.transaction.findMany({
      include: {
        fromUser: { select: { username: true } },
        toUser: { select: { username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return {
      success: true,
      data: transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        status: tx.status,
        fromUsername: tx.fromUser?.username || null,
        toUsername: tx.toUser?.username || null,
        amount: Number(tx.amount),
        memo: tx.memo,
        isPublic: tx.isPublic,
        createdAt: tx.createdAt,
      })),
    };
  });

  /**
   * GET /dev/stats
   * Get system stats (no auth required in dev)
   */
  app.get('/stats', async () => {
    const [userCount, txCount, totalTokens, recentTx] = await Promise.all([
      prisma.user.count(),
      prisma.transaction.count(),
      prisma.wallet.aggregate({ _sum: { balance: true } }),
      prisma.transaction.count({
        where: { createdAt: { gt: new Date(Date.now() - 3600000) } }, // Last hour
      }),
    ]);

    return {
      success: true,
      data: {
        users: userCount,
        transactions: txCount,
        transactionsLastHour: recentTx,
        totalTokensCirculating: Number(totalTokens._sum.balance || 0),
      },
    };
  });

  /**
   * POST /dev/mint/:username
   * Mint tokens to a user (for testing)
   */
  app.post<{ Params: { username: string }; Body: { amount: number } }>(
    '/mint/:username',
    async (request, reply) => {
      const { username } = request.params;
      const { amount } = request.body;

      if (!amount || amount <= 0 || amount > 10000) {
        return reply.status(400).send({
          success: false,
          error: { message: 'Amount must be between 1 and 10000' },
        });
      }

      const user = await prisma.user.findUnique({
        where: { username: username.toLowerCase() },
        include: { wallet: true },
      });

      if (!user || !user.wallet) {
        return reply.status(404).send({
          success: false,
          error: { message: 'User not found' },
        });
      }

      // Create load transaction and update wallet
      const [tx, wallet] = await prisma.$transaction([
        prisma.transaction.create({
          data: {
            type: 'load',
            status: 'completed',
            toUserId: user.id,
            amount,
            feeAmount: 0,
            memo: '[DEV] Test token mint',
            isPublic: false,
            completedAt: new Date(),
          },
        }),
        prisma.wallet.update({
          where: { userId: user.id },
          data: {
            balance: { increment: amount },
            totalLoaded: { increment: amount },
          },
        }),
      ]);

      request.log.info({ username, amount }, '[DEV] Minted tokens');

      return {
        success: true,
        data: {
          transactionId: tx.id,
          newBalance: Number(wallet.balance),
        },
      };
    }
  );

  /**
   * POST /dev/weekly-cycle
   * Create or update the current weekly cycle with test revenue data
   * This simulates fee accumulation for testing the rewards display
   */
  app.post<{ Body: { revenue?: number; activeUsers?: number } }>(
    '/weekly-cycle',
    async (request) => {
      const { revenue = 10000, activeUsers = 5 } = request.body || {};

      // Calculate week number (YYYYWW format)
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const weekNumber = Math.ceil(
        ((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
      );
      const fullWeekNumber = now.getFullYear() * 100 + weekNumber;

      // Week boundaries (Monday to Sunday)
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const startsAt = new Date(now);
      startsAt.setDate(now.getDate() + mondayOffset);
      startsAt.setHours(0, 0, 0, 0);
      
      const endsAt = new Date(startsAt);
      endsAt.setDate(startsAt.getDate() + 6);
      endsAt.setHours(23, 59, 59, 999);

      // Revenue split: 30% ops, 70% user pool (all values in cents)
      const opsAllocation = Math.floor(revenue * 0.30);
      const userPool = revenue - opsAllocation;
      // Per-user reward floored to whole dollars (in cents), remainder carries over
      const perUserRewardCents = activeUsers > 0 ? Math.floor(userPool / activeUsers) : 0;
      // Floor to nearest 100 cents ($1) - extra cents carry to next week
      const perUserRewardWholeDollars = Math.floor(perUserRewardCents / 100) * 100;
      const remainder = activeUsers > 0 ? userPool - (perUserRewardWholeDollars * activeUsers) : 0;

      const cycle = await prisma.weeklyCycle.upsert({
        where: { weekNumber: fullWeekNumber },
        create: {
          weekNumber: fullWeekNumber,
          startsAt,
          endsAt,
          totalRevenue: revenue,
          opsAllocation,
          userPool,
          remainder,
          activeUserCount: activeUsers,
          perUserReward: perUserRewardWholeDollars,
          status: 'distributed',
          distributedAt: new Date(),
        },
        update: {
          totalRevenue: revenue,
          opsAllocation,
          userPool,
          remainder,
          activeUserCount: activeUsers,
          perUserReward: perUserRewardWholeDollars,
          status: 'distributed',
          distributedAt: new Date(),
        },
      });

      request.log.info({ weekNumber: fullWeekNumber, revenue, perUserReward: perUserRewardWholeDollars, remainder }, '[DEV] Weekly cycle updated');

      return {
        success: true,
        data: {
          weekNumber: cycle.weekNumber,
          totalRevenue: Number(cycle.totalRevenue) / 100, // Convert cents to dollars for display
          opsAllocation: Number(cycle.opsAllocation) / 100,
          userPool: Number(cycle.userPool) / 100,
          activeUserCount: cycle.activeUserCount,
          perUserReward: Number(cycle.perUserReward) / 100, // Already floored to whole dollars
          remainder: Number(cycle.remainder) / 100, // Cents carried to next week
          status: cycle.status,
        },
      };
    }
  );

  /**
   * GET /dev/weekly-cycle
   * Get the current weekly cycle data
   */
  app.get('/weekly-cycle', async () => {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const weekNumber = Math.ceil(
      ((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
    );
    const fullWeekNumber = now.getFullYear() * 100 + weekNumber;

    const cycle = await prisma.weeklyCycle.findUnique({
      where: { weekNumber: fullWeekNumber },
    });

    if (!cycle) {
      return {
        success: true,
        data: null,
        message: 'No weekly cycle found. Use POST /dev/weekly-cycle to create one.',
      };
    }

    return {
      success: true,
      data: {
        weekNumber: cycle.weekNumber,
        totalRevenue: Number(cycle.totalRevenue) / 100,
        opsAllocation: Number(cycle.opsAllocation) / 100,
        userPool: Number(cycle.userPool) / 100,
        activeUserCount: cycle.activeUserCount,
        perUserReward: Number(cycle.perUserReward) / 100,
        status: cycle.status,
        startsAt: cycle.startsAt,
        endsAt: cycle.endsAt,
      },
    };
  });
};

