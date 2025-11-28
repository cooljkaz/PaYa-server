import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { feedQuerySchema } from '@paya/shared';

export const feedRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /feed
   * Get the public payment feed (no auth required)
   */
  app.get<{
    Querystring: { page?: string; pageSize?: string; before?: string };
  }>('/', async (request) => {
    const query = feedQuerySchema.parse(request.query);
    const { page, pageSize, before } = query;

    const where = {
      type: 'payment' as const,
      isPublic: true,
      status: 'completed' as const,
      fromUser: { status: 'active' },
      toUser: { status: 'active' },
      ...(before && { createdAt: { lt: new Date(before) } }),
    };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          fromUser: { select: { username: true } },
          toUser: { select: { username: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: before ? 0 : (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.transaction.count({ where }),
    ]);

    return {
      success: true,
      data: {
        items: transactions.map((tx) => ({
          id: tx.id,
          fromUsername: tx.fromUser!.username,
          toUsername: tx.toUser!.username,
          amount: Number(tx.amount),
          memo: tx.memo,
          createdAt: tx.createdAt,
        })),
        total,
        page,
        pageSize,
        hasMore: transactions.length === pageSize,
        // Cursor for infinite scroll
        nextCursor: transactions.length > 0 
          ? transactions[transactions.length - 1].createdAt.toISOString()
          : null,
      },
    };
  });

  /**
   * WebSocket /feed/live
   * Real-time feed updates
   */
  app.get('/live', { websocket: true }, (socket, request) => {
    request.log.info('Client connected to live feed');

    // Subscribe to new payments
    // In production, use Redis pub/sub for scaling across multiple servers
    const interval = setInterval(async () => {
      // This is a simplified polling approach
      // In production, use actual pub/sub
      try {
        const latest = await prisma.transaction.findFirst({
          where: {
            type: 'payment',
            isPublic: true,
            status: 'completed',
            createdAt: { gt: new Date(Date.now() - 5000) }, // Last 5 seconds
          },
          include: {
            fromUser: { select: { username: true } },
            toUser: { select: { username: true } },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (latest) {
          socket.send(JSON.stringify({
            type: 'new_payment',
            data: {
              id: latest.id,
              fromUsername: latest.fromUser!.username,
              toUsername: latest.toUser!.username,
              amount: Number(latest.amount),
              memo: latest.memo,
              createdAt: latest.createdAt,
            },
          }));
        }
      } catch (error) {
        request.log.error(error, 'Error fetching latest payment');
      }
    }, 2000);

    socket.on('close', () => {
      clearInterval(interval);
      request.log.info('Client disconnected from live feed');
    });

    socket.on('error', (error) => {
      clearInterval(interval);
      request.log.error(error, 'WebSocket error');
    });
  });
};

