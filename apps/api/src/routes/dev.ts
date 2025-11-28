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
};

