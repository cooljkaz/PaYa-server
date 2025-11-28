import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { 
  loadMoneySchema, 
  redeemMoneySchema,
  type LoadMoneyInput,
  type RedeemMoneyInput,
  ERROR_CODES,
  FREE_REDEMPTION_LIMIT,
  OVER_LIMIT_REDEMPTION_FEE_CENTS,
  NEW_ACCOUNT,
  RATE_LIMITS,
} from '@paya/shared';
import { checkRateLimit } from '../lib/redis.js';
import { generateIdempotencyKey, isNewAccount, getWeekNumber } from '../lib/utils.js';

export const bankRoutes: FastifyPluginAsync = async (app) => {
  // All routes require authentication
  app.addHook('preValidation', app.authenticate);

  /**
   * GET /bank/accounts
   * Get user's linked bank accounts
   */
  app.get('/accounts', async (request) => {
    const accounts = await prisma.bankAccount.findMany({
      where: {
        userId: request.userId,
        status: { not: 'removed' },
      },
      select: {
        id: true,
        institutionName: true,
        accountName: true,
        accountMask: true,
        accountType: true,
        status: true,
        verifiedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: accounts,
    };
  });

  /**
   * POST /bank/link/create-token
   * Create a Plaid Link token for connecting a bank account
   */
  app.post('/link/create-token', async (request, reply) => {
    // TODO: Integrate with Plaid
    // For now, return a mock token for development

    if (process.env.NODE_ENV === 'development') {
      return {
        success: true,
        data: {
          linkToken: 'link-sandbox-mock-token',
          expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        },
      };
    }

    // Production: Call Plaid API
    // const plaidClient = getPlaidClient();
    // const response = await plaidClient.linkTokenCreate({
    //   user: { client_user_id: request.userId },
    //   client_name: 'PaYa',
    //   products: ['auth'],
    //   country_codes: ['US'],
    //   language: 'en',
    // });

    return reply.status(501).send({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Plaid integration not configured',
      },
    });
  });

  /**
   * POST /bank/link/exchange
   * Exchange Plaid public token for access token and create bank account
   */
  app.post<{ Body: { publicToken: string; accountId: string } }>(
    '/link/exchange',
    async (request, reply) => {
      const { publicToken, accountId } = request.body;

      // TODO: Integrate with Plaid
      // For development, create a mock bank account

      if (process.env.NODE_ENV === 'development') {
        const bankAccount = await prisma.bankAccount.create({
          data: {
            userId: request.userId,
            plaidAccessToken: 'mock-access-token',
            plaidAccountId: accountId || 'mock-account-id',
            plaidItemId: 'mock-item-id',
            institutionName: 'Mock Bank',
            accountName: 'Checking Account',
            accountMask: '1234',
            accountType: 'checking',
            status: 'verified',
            verifiedAt: new Date(),
          },
        });

        return {
          success: true,
          data: {
            id: bankAccount.id,
            institutionName: bankAccount.institutionName,
            accountMask: bankAccount.accountMask,
            status: bankAccount.status,
          },
        };
      }

      return reply.status(501).send({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Plaid integration not configured',
        },
      });
    }
  );

  /**
   * POST /bank/load
   * Load money from bank to wallet (ACH pull)
   */
  app.post<{ Body: LoadMoneyInput }>('/load', async (request, reply) => {
    const body = loadMoneySchema.parse(request.body);
    const { amount, idempotencyKey } = body;

    // Check if user has verified bank account
    const bankAccount = await prisma.bankAccount.findFirst({
      where: {
        userId: request.userId,
        status: 'verified',
      },
    });

    if (!bankAccount) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ERROR_CODES.BANK_NOT_LINKED,
          message: 'No verified bank account found. Please link a bank account first.',
        },
      });
    }

    // Check new account restrictions
    const user = await prisma.user.findUnique({
      where: { id: request.userId },
    });

    if (user && isNewAccount(user.createdAt, NEW_ACCOUNT.COOLING_PERIOD_DAYS)) {
      if (amount > NEW_ACCOUNT.FIRST_WEEK_MAX_LOAD) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
            message: `New accounts can only load up to ${NEW_ACCOUNT.FIRST_WEEK_MAX_LOAD} tokens in the first week`,
          },
        });
      }
    }

    // Check weekly load limit
    const weeklyKey = `rate:load:weekly:${request.userId}`;
    const weeklyCheck = await checkRateLimit(weeklyKey, RATE_LIMITS.LOAD_PER_WEEK, 604800);

    if (!weeklyCheck.allowed) {
      return reply.status(429).send({
        success: false,
        error: {
          code: ERROR_CODES.WEEKLY_LIMIT_EXCEEDED,
          message: 'Weekly load limit exceeded',
        },
      });
    }

    const key = idempotencyKey || generateIdempotencyKey();

    // Create pending transaction
    // In production, this would initiate an ACH pull via Dwolla
    const transaction = await prisma.$transaction(async (tx) => {
      // Check idempotency
      const existing = await tx.transaction.findUnique({
        where: { idempotencyKey: key },
      });

      if (existing) {
        return existing;
      }

      // For development, auto-complete the load
      // In production, this would be 'pending' until ACH clears
      const status = process.env.NODE_ENV === 'development' ? 'completed' : 'pending';

      const newTx = await tx.transaction.create({
        data: {
          type: 'load',
          status,
          toUserId: request.userId,
          amount,
          feeAmount: 0,
          idempotencyKey: key,
          completedAt: status === 'completed' ? new Date() : null,
        },
      });

      // In development, immediately credit wallet
      if (status === 'completed') {
        await tx.wallet.update({
          where: { userId: request.userId },
          data: {
            balance: { increment: amount },
            totalLoaded: { increment: amount },
          },
        });
      }

      return newTx;
    });

    request.log.info({ txId: transaction.id, amount }, 'Load initiated');

    const wallet = await prisma.wallet.findUnique({
      where: { userId: request.userId },
    });

    return reply.status(201).send({
      success: true,
      data: {
        transaction: {
          id: transaction.id,
          type: 'load',
          status: transaction.status,
          amount,
          createdAt: transaction.createdAt,
        },
        newBalance: Number(wallet?.balance || 0),
        message: transaction.status === 'pending' 
          ? 'Load initiated. Funds will be available in 3-5 business days.'
          : 'Funds loaded successfully.',
      },
    });
  });

  /**
   * POST /bank/redeem
   * Redeem tokens to bank (ACH push)
   */
  app.post<{ Body: RedeemMoneyInput }>('/redeem', async (request, reply) => {
    const body = redeemMoneySchema.parse(request.body);
    const { amount, idempotencyKey } = body;

    // Check if user has verified bank account
    const bankAccount = await prisma.bankAccount.findFirst({
      where: {
        userId: request.userId,
        status: 'verified',
      },
    });

    if (!bankAccount) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ERROR_CODES.BANK_NOT_LINKED,
          message: 'No verified bank account found. Please link a bank account first.',
        },
      });
    }

    // Check new account redemption restriction
    const user = await prisma.user.findUnique({
      where: { id: request.userId },
    });

    if (user && isNewAccount(user.createdAt, NEW_ACCOUNT.NO_REDEEM_DAYS)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
          message: `New accounts cannot redeem for ${NEW_ACCOUNT.NO_REDEEM_DAYS} days`,
        },
      });
    }

    // Calculate fee
    // First 100 tokens/week = free, above = $3 flat fee
    const weekNumber = getWeekNumber();
    const weeklyRedemptions = await prisma.transaction.aggregate({
      where: {
        fromUserId: request.userId,
        type: 'redemption',
        status: { in: ['completed', 'processing', 'pending'] },
        createdAt: { gte: getWeekStart() },
      },
      _sum: { amount: true },
    });

    const weeklyTotal = Number(weeklyRedemptions._sum.amount || 0);
    const remainingFree = Math.max(0, FREE_REDEMPTION_LIMIT - weeklyTotal);
    const feeAmount = amount > remainingFree ? OVER_LIMIT_REDEMPTION_FEE_CENTS / 100 : 0;

    // Check balance (including fee)
    const wallet = await prisma.wallet.findUnique({
      where: { userId: request.userId },
    });

    if (!wallet || Number(wallet.balance) < amount + feeAmount) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ERROR_CODES.INSUFFICIENT_BALANCE,
          message: 'Insufficient balance',
        },
      });
    }

    const key = idempotencyKey || generateIdempotencyKey();

    const transaction = await prisma.$transaction(async (tx) => {
      // Check idempotency
      const existing = await tx.transaction.findUnique({
        where: { idempotencyKey: key },
      });

      if (existing) {
        return existing;
      }

      // For development, auto-complete
      // In production, this would be 'pending' until ACH push initiates
      const status = process.env.NODE_ENV === 'development' ? 'completed' : 'pending';

      const newTx = await tx.transaction.create({
        data: {
          type: 'redemption',
          status,
          fromUserId: request.userId,
          amount,
          feeAmount,
          idempotencyKey: key,
          completedAt: status === 'completed' ? new Date() : null,
        },
      });

      // Debit wallet
      await tx.wallet.update({
        where: { userId: request.userId },
        data: {
          balance: { decrement: amount + feeAmount },
          totalRedeemed: { increment: amount },
        },
      });

      // If there's a fee, record it as revenue
      if (feeAmount > 0) {
        await tx.transaction.create({
          data: {
            type: 'fee',
            status: 'completed',
            fromUserId: request.userId,
            amount: feeAmount,
            feeAmount: 0,
            metadata: { reason: 'redemption_over_limit', parentTxId: newTx.id },
            completedAt: new Date(),
          },
        });
      }

      return newTx;
    });

    request.log.info({ txId: transaction.id, amount, fee: feeAmount }, 'Redemption initiated');

    const updatedWallet = await prisma.wallet.findUnique({
      where: { userId: request.userId },
    });

    return reply.status(201).send({
      success: true,
      data: {
        transaction: {
          id: transaction.id,
          type: 'redemption',
          status: transaction.status,
          amount,
          feeAmount,
          createdAt: transaction.createdAt,
        },
        newBalance: Number(updatedWallet?.balance || 0),
        message: transaction.status === 'pending'
          ? 'Redemption initiated. Funds will arrive in 1-3 business days.'
          : 'Redemption completed.',
      },
    });
  });

  /**
   * DELETE /bank/accounts/:id
   * Remove a linked bank account
   */
  app.delete<{ Params: { id: string } }>('/accounts/:id', async (request, reply) => {
    const { id } = request.params;

    const account = await prisma.bankAccount.findFirst({
      where: {
        id,
        userId: request.userId,
      },
    });

    if (!account) {
      return reply.status(404).send({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Bank account not found',
        },
      });
    }

    await prisma.bankAccount.update({
      where: { id },
      data: {
        status: 'removed',
        removedAt: new Date(),
      },
    });

    return {
      success: true,
      data: { message: 'Bank account removed' },
    };
  });
};

// Helper to get start of current week
function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(now.setDate(diff));
  start.setHours(0, 0, 0, 0);
  return start;
}

