import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { ERROR_CODES, TOKEN_TO_CENTS } from '@paya/shared';

export const walletRoutes: FastifyPluginAsync = async (app) => {
  // All routes require authentication
  app.addHook('preValidation', app.authenticate);

  /**
   * GET /wallet
   * Get current user's wallet balance and stats
   */
  app.get('/', async (request, reply) => {
    const wallet = await prisma.wallet.findUnique({
      where: { userId: request.userId },
    });

    if (!wallet) {
      return reply.status(404).send({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Wallet not found',
        },
      });
    }

    return {
      success: true,
      data: {
        balance: Number(wallet.balance),
        balanceUsd: Number(wallet.balance) * (TOKEN_TO_CENTS / 100),
        totalLoaded: Number(wallet.totalLoaded),
        totalSent: Number(wallet.totalSent),
        totalReceived: Number(wallet.totalReceived),
        totalRedeemed: Number(wallet.totalRedeemed),
        totalRewards: Number(wallet.totalRewards),
        updatedAt: wallet.updatedAt,
      },
    };
  });

  /**
   * GET /wallet/transactions
   * Get transaction history for current user
   */
  app.get<{
    Querystring: { page?: string; pageSize?: string; type?: string };
  }>('/transactions', async (request, reply) => {
    const page = Math.max(1, parseInt(request.query.page || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(request.query.pageSize || '20')));
    const type = request.query.type;

    const where = {
      OR: [
        { fromUserId: request.userId },
        { toUserId: request.userId },
      ],
      ...(type && { type }),
    };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          fromUser: { select: { id: true, username: true } },
          toUser: { select: { id: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.transaction.count({ where }),
    ]);

    return {
      success: true,
      data: {
        items: transactions.map((tx) => ({
          id: tx.id,
          type: tx.type,
          status: tx.status,
          amount: Number(tx.amount),
          feeAmount: Number(tx.feeAmount),
          memo: tx.memo,
          isPublic: tx.isPublic,
          fromUser: tx.fromUser ? { id: tx.fromUser.id, username: tx.fromUser.username } : null,
          toUser: tx.toUser ? { id: tx.toUser.id, username: tx.toUser.username } : null,
          direction: tx.fromUserId === request.userId ? 'out' : 'in',
          createdAt: tx.createdAt,
          completedAt: tx.completedAt,
        })),
        total,
        page,
        pageSize,
        hasMore: page * pageSize < total,
      },
    };
  });

  /**
   * GET /wallet/transactions/:id
   * Get a specific transaction
   */
  app.get<{ Params: { id: string } }>('/transactions/:id', async (request, reply) => {
    const { id } = request.params;

    const transaction = await prisma.transaction.findFirst({
      where: {
        id,
        OR: [
          { fromUserId: request.userId },
          { toUserId: request.userId },
        ],
      },
      include: {
        fromUser: { select: { id: true, username: true } },
        toUser: { select: { id: true, username: true } },
      },
    });

    if (!transaction) {
      return reply.status(404).send({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Transaction not found',
        },
      });
    }

    return {
      success: true,
      data: {
        id: transaction.id,
        type: transaction.type,
        status: transaction.status,
        amount: Number(transaction.amount),
        feeAmount: Number(transaction.feeAmount),
        memo: transaction.memo,
        isPublic: transaction.isPublic,
        fromUser: transaction.fromUser,
        toUser: transaction.toUser,
        direction: transaction.fromUserId === request.userId ? 'out' : 'in',
        createdAt: transaction.createdAt,
        completedAt: transaction.completedAt,
      },
    };
  });
};

