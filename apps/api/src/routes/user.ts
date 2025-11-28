import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { ERROR_CODES } from '@paya/shared';

export const userRoutes: FastifyPluginAsync = async (app) => {
  // All routes require authentication
  app.addHook('preValidation', app.authenticate);

  /**
   * GET /users/me
   * Get current user profile
   */
  app.get('/me', async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      include: { wallet: true },
    });

    if (!user) {
      return reply.status(404).send({
        success: false,
        error: {
          code: ERROR_CODES.USER_NOT_FOUND,
          message: 'User not found',
        },
      });
    }

    return {
      success: true,
      data: {
        id: user.id,
        username: user.username,
        phoneLastFour: user.phoneLastFour,
        status: user.status,
        flags: user.flags,
        createdAt: user.createdAt,
        lastActiveAt: user.lastActiveAt,
        wallet: {
          balance: Number(user.wallet?.balance || 0),
          totalLoaded: Number(user.wallet?.totalLoaded || 0),
          totalSent: Number(user.wallet?.totalSent || 0),
          totalReceived: Number(user.wallet?.totalReceived || 0),
          totalRedeemed: Number(user.wallet?.totalRedeemed || 0),
          totalRewards: Number(user.wallet?.totalRewards || 0),
        },
      },
    };
  });

  /**
   * GET /users/:username
   * Get public profile of another user
   */
  app.get<{ Params: { username: string } }>('/:username', async (request, reply) => {
    const { username } = request.params;

    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: {
        id: true,
        username: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user || user.status !== 'active') {
      return reply.status(404).send({
        success: false,
        error: {
          code: ERROR_CODES.USER_NOT_FOUND,
          message: 'User not found',
        },
      });
    }

    return {
      success: true,
      data: {
        id: user.id,
        username: user.username,
        createdAt: user.createdAt,
      },
    };
  });

  /**
   * GET /users/search
   * Search for users by username prefix
   */
  app.get<{ Querystring: { q: string; limit?: string } }>('/search', async (request, reply) => {
    const { q, limit = '10' } = request.query;

    if (!q || q.length < 2) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Search query must be at least 2 characters',
        },
      });
    }

    const users = await prisma.user.findMany({
      where: {
        username: {
          startsWith: q.toLowerCase(),
        },
        status: 'active',
        id: { not: request.userId }, // Exclude self
      },
      select: {
        id: true,
        username: true,
      },
      take: Math.min(parseInt(limit), 20),
      orderBy: { username: 'asc' },
    });

    return {
      success: true,
      data: users,
    };
  });
};

