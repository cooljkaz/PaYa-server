import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { ERROR_CODES } from '@paya/shared';

export const adminRoutes: FastifyPluginAsync = async (app) => {
  // Admin authentication check
  app.addHook('preValidation', async (request, reply) => {
    await app.authenticate(request, reply);

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: request.userId },
    });

    // Simple admin check: phone matches ADMIN_PHONE env var
    // In production, use a proper admin role system
    const isAdmin = user?.phoneHash === hashAdminPhone();

    if (!isAdmin) {
      return reply.status(403).send({
        success: false,
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: 'Admin access required',
        },
      });
    }
  });

  /**
   * GET /admin/users
   * List all users with filters
   */
  app.get<{
    Querystring: {
      status?: string;
      page?: string;
      pageSize?: string;
      search?: string;
    };
  }>('/users', async (request) => {
    const { status, search, page = '1', pageSize = '20' } = request.query;
    const pageNum = parseInt(page);
    const pageSizeNum = Math.min(100, parseInt(pageSize));

    const where = {
      ...(status && { status }),
      ...(search && {
        OR: [
          { username: { contains: search, mode: 'insensitive' as const } },
          { phoneLastFour: { contains: search } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: { wallet: true },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * pageSizeNum,
        take: pageSizeNum,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      success: true,
      data: {
        items: users.map((u) => ({
          id: u.id,
          username: u.username,
          phoneLastFour: u.phoneLastFour,
          status: u.status,
          flags: u.flags,
          balance: Number(u.wallet?.balance || 0),
          createdAt: u.createdAt,
          lastActiveAt: u.lastActiveAt,
        })),
        total,
        page: pageNum,
        pageSize: pageSizeNum,
        hasMore: pageNum * pageSizeNum < total,
      },
    };
  });

  /**
   * POST /admin/users/:id/freeze
   * Freeze a user account
   */
  app.post<{ Params: { id: string }; Body: { reason: string } }>(
    '/users/:id/freeze',
    async (request, reply) => {
      const { id } = request.params;
      const { reason } = request.body;

      const user = await prisma.user.findUnique({ where: { id } });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: { code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found' },
        });
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id },
          data: { status: 'frozen' },
        }),
        prisma.auditLog.create({
          data: {
            actorType: 'admin',
            actorId: request.userId,
            action: 'account_freeze',
            resourceType: 'user',
            resourceId: id,
            details: { reason },
          },
        }),
      ]);

      request.log.info({ userId: id, adminId: request.userId, reason }, 'User frozen');

      return {
        success: true,
        data: { message: 'User account frozen' },
      };
    }
  );

  /**
   * POST /admin/users/:id/unfreeze
   * Unfreeze a user account
   */
  app.post<{ Params: { id: string } }>('/users/:id/unfreeze', async (request, reply) => {
    const { id } = request.params;

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      return reply.status(404).send({
        success: false,
        error: { code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found' },
      });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { status: 'active' },
      }),
      prisma.auditLog.create({
        data: {
          actorType: 'admin',
          actorId: request.userId,
          action: 'account_unfreeze',
          resourceType: 'user',
          resourceId: id,
        },
      }),
    ]);

    request.log.info({ userId: id, adminId: request.userId }, 'User unfrozen');

    return {
      success: true,
      data: { message: 'User account unfrozen' },
    };
  });

  /**
   * POST /admin/users/:id/flag
   * Add a flag to user account
   */
  app.post<{ Params: { id: string }; Body: { flag: string; reason?: string } }>(
    '/users/:id/flag',
    async (request, reply) => {
      const { id } = request.params;
      const { flag, reason } = request.body;

      const user = await prisma.user.findUnique({ where: { id } });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: { code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found' },
        });
      }

      const currentFlags = (user.flags as string[]) || [];
      if (!currentFlags.includes(flag)) {
        await prisma.$transaction([
          prisma.user.update({
            where: { id },
            data: { flags: [...currentFlags, flag] },
          }),
          prisma.auditLog.create({
            data: {
              actorType: 'admin',
              actorId: request.userId,
              action: 'add_flag',
              resourceType: 'user',
              resourceId: id,
              details: { flag, reason },
            },
          }),
        ]);
      }

      return {
        success: true,
        data: { message: `Flag '${flag}' added` },
      };
    }
  );

  /**
   * GET /admin/transactions
   * List transactions with filters
   */
  app.get<{
    Querystring: {
      type?: string;
      status?: string;
      userId?: string;
      page?: string;
      pageSize?: string;
    };
  }>('/transactions', async (request) => {
    const { type, status, userId, page = '1', pageSize = '50' } = request.query;
    const pageNum = parseInt(page);
    const pageSizeNum = Math.min(100, parseInt(pageSize));

    const where = {
      ...(type && { type }),
      ...(status && { status }),
      ...(userId && {
        OR: [{ fromUserId: userId }, { toUserId: userId }],
      }),
    };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          fromUser: { select: { id: true, username: true } },
          toUser: { select: { id: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * pageSizeNum,
        take: pageSizeNum,
      }),
      prisma.transaction.count({ where }),
    ]);

    return {
      success: true,
      data: {
        items: transactions,
        total,
        page: pageNum,
        pageSize: pageSizeNum,
        hasMore: pageNum * pageSizeNum < total,
      },
    };
  });

  /**
   * GET /admin/audit-logs
   * List audit logs
   */
  app.get<{
    Querystring: {
      action?: string;
      actorId?: string;
      resourceId?: string;
      page?: string;
      pageSize?: string;
    };
  }>('/audit-logs', async (request) => {
    const { action, actorId, resourceId, page = '1', pageSize = '50' } = request.query;
    const pageNum = parseInt(page);
    const pageSizeNum = Math.min(100, parseInt(pageSize));

    const where = {
      ...(action && { action }),
      ...(actorId && { actorId }),
      ...(resourceId && { resourceId }),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * pageSizeNum,
        take: pageSizeNum,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      success: true,
      data: {
        items: logs,
        total,
        page: pageNum,
        pageSize: pageSizeNum,
        hasMore: pageNum * pageSizeNum < total,
      },
    };
  });

  /**
   * POST /admin/reserve/snapshot
   * Create a reserve balance snapshot (for reconciliation)
   */
  app.post<{ Body: { reserveBalanceCents: number } }>(
    '/reserve/snapshot',
    async (request) => {
      const { reserveBalanceCents } = request.body;

      // Calculate total tokens in circulation
      const totalTokens = await prisma.wallet.aggregate({
        _sum: { balance: true },
      });

      const totalTokensNum = Number(totalTokens._sum.balance || 0);
      const expectedReserveCents = totalTokensNum * 100; // 1 token = $1 = 100 cents
      const discrepancy = reserveBalanceCents - expectedReserveCents;
      const isBalanced = Math.abs(discrepancy) < 100; // Allow $1 tolerance

      const snapshot = await prisma.reserveSnapshot.create({
        data: {
          reserveBalanceCents,
          totalTokensCirculation: totalTokensNum,
          isBalanced,
          discrepancyCents: discrepancy,
          source: 'manual_audit',
        },
      });

      await prisma.auditLog.create({
        data: {
          actorType: 'admin',
          actorId: request.userId,
          action: 'reserve_snapshot',
          resourceType: 'reserve',
          resourceId: snapshot.id,
          details: {
            reserveBalanceCents,
            totalTokens: totalTokensNum,
            isBalanced,
            discrepancy,
          },
        },
      });

      return {
        success: true,
        data: {
          id: snapshot.id,
          reserveBalanceCents,
          totalTokensCirculation: totalTokensNum,
          isBalanced,
          discrepancyCents: discrepancy,
          createdAt: snapshot.createdAt,
        },
      };
    }
  );
};

// Helper to hash admin phone for comparison
function hashAdminPhone(): string | null {
  const adminPhone = process.env.ADMIN_PHONE;
  if (!adminPhone) return null;

  const crypto = require('crypto');
  const salt = process.env.PHONE_HASH_SALT || 'paya-phone-salt';
  return crypto.createHash('sha256').update(`${salt}:${adminPhone}`).digest('hex');
}

