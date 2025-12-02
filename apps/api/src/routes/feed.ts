import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { feedQuerySchema } from '@paya/shared';

/**
 * Get user's network connections up to N degrees of separation
 */
async function getUserNetwork(userId: string, maxDegrees: number = 2): Promise<{
  firstDegree: Set<string>;
  secondDegree: Set<string>;
  thirdDegree: Set<string>;
}> {
  const firstDegree = new Set<string>();
  const secondDegree = new Set<string>();
  const thirdDegree = new Set<string>();

  // 1st degree: People the user has directly transacted with
  const directTransactions = await prisma.transaction.findMany({
    where: {
      type: 'payment',
      status: 'completed',
      OR: [
        { fromUserId: userId },
        { toUserId: userId },
      ],
    },
    select: {
      fromUserId: true,
      toUserId: true,
    },
  });

  for (const tx of directTransactions) {
    if (tx.fromUserId && tx.fromUserId !== userId) firstDegree.add(tx.fromUserId);
    if (tx.toUserId && tx.toUserId !== userId) firstDegree.add(tx.toUserId);
  }

  if (maxDegrees < 2 || firstDegree.size === 0) {
    return { firstDegree, secondDegree, thirdDegree };
  }

  // 2nd degree: People the 1st degree connections have transacted with
  const firstDegreeIds = Array.from(firstDegree);
  const secondDegreeTransactions = await prisma.transaction.findMany({
    where: {
      type: 'payment',
      status: 'completed',
      OR: [
        { fromUserId: { in: firstDegreeIds } },
        { toUserId: { in: firstDegreeIds } },
      ],
    },
    select: {
      fromUserId: true,
      toUserId: true,
    },
  });

  for (const tx of secondDegreeTransactions) {
    if (tx.fromUserId && tx.fromUserId !== userId && !firstDegree.has(tx.fromUserId)) {
      secondDegree.add(tx.fromUserId);
    }
    if (tx.toUserId && tx.toUserId !== userId && !firstDegree.has(tx.toUserId)) {
      secondDegree.add(tx.toUserId);
    }
  }

  if (maxDegrees < 3 || secondDegree.size === 0) {
    return { firstDegree, secondDegree, thirdDegree };
  }

  // 3rd degree: For future merchant support
  const secondDegreeIds = Array.from(secondDegree);
  const thirdDegreeTransactions = await prisma.transaction.findMany({
    where: {
      type: 'payment',
      status: 'completed',
      OR: [
        { fromUserId: { in: secondDegreeIds } },
        { toUserId: { in: secondDegreeIds } },
      ],
    },
    select: {
      fromUserId: true,
      toUserId: true,
    },
    take: 1000, // Limit for performance
  });

  for (const tx of thirdDegreeTransactions) {
    if (tx.fromUserId && tx.fromUserId !== userId && 
        !firstDegree.has(tx.fromUserId) && !secondDegree.has(tx.fromUserId)) {
      thirdDegree.add(tx.fromUserId);
    }
    if (tx.toUserId && tx.toUserId !== userId && 
        !firstDegree.has(tx.toUserId) && !secondDegree.has(tx.toUserId)) {
      thirdDegree.add(tx.toUserId);
    }
  }

  return { firstDegree, secondDegree, thirdDegree };
}

export const feedRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /feed
   * Get the global public payment feed (no auth required)
   * Used for transparency page / non-logged-in users
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
          isOwnTransaction: false,
          connectionDegree: null,
        })),
        total,
        page,
        pageSize,
        hasMore: transactions.length === pageSize,
        nextCursor: transactions.length > 0 
          ? transactions[transactions.length - 1].createdAt.toISOString()
          : null,
      },
    };
  });

  /**
   * GET /feed/personal
   * Get personalized "Your Feed" with 2 degrees of separation
   * Includes:
   * - User's own transactions (including private)
   * - 1st degree: Public transactions from direct connections
   * - 2nd degree: Public transactions from connections' connections
   */
  app.get<{
    Querystring: { page?: string; pageSize?: string; before?: string };
  }>('/personal', {
    preValidation: [app.authenticate],
  }, async (request) => {
    const query = feedQuerySchema.parse(request.query);
    const { page, pageSize, before } = query;
    const userId = request.userId;

    // Get user's network (2 degrees of separation)
    const { firstDegree, secondDegree } = await getUserNetwork(userId, 2);
    
    const firstDegreeIds = Array.from(firstDegree);
    const secondDegreeIds = Array.from(secondDegree);
    const networkIds = [...firstDegreeIds, ...secondDegreeIds];

    // Build the query for personal feed
    const whereConditions = [
      // User's own transactions (including private)
      {
        type: 'payment' as const,
        status: 'completed' as const,
        OR: [
          { fromUserId: userId },
          { toUserId: userId },
        ],
      },
    ];

    // Add network transactions (public only) if user has connections
    if (networkIds.length > 0) {
      whereConditions.push({
        type: 'payment' as const,
        status: 'completed' as const,
        isPublic: true,
        OR: [
          { fromUserId: { in: networkIds } },
          { toUserId: { in: networkIds } },
        ],
        // Exclude user's own transactions (already included above)
        AND: [
          { fromUserId: { not: userId } },
          { toUserId: { not: userId } },
        ],
      } as any);
    }

    const where = {
      OR: whereConditions,
      ...(before && { createdAt: { lt: new Date(before) } }),
    };

    // Query with deduplication - transactions can match multiple conditions
    // (e.g., both sender AND receiver are in your network)
    const rawTransactions = await prisma.transaction.findMany({
      where,
      include: {
        fromUser: { select: { id: true, username: true } },
        toUser: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
      // Fetch extra to account for potential duplicates after deduplication
      take: pageSize * 2,
    });

    // Deduplicate by transaction ID
    const seenIds = new Set<string>();
    const deduped = rawTransactions.filter(tx => {
      if (seenIds.has(tx.id)) return false;
      seenIds.add(tx.id);
      return true;
    });

    // Apply pagination after deduplication
    const startIndex = before ? 0 : (page - 1) * pageSize;
    const transactions = deduped.slice(startIndex, startIndex + pageSize);
    
    // Count unique transactions
    const total = await prisma.transaction.count({ where });

    // Add metadata about connection degree
    const items = transactions.map((tx) => {
      const isOwnTransaction = tx.fromUserId === userId || tx.toUserId === userId;
      
      let connectionDegree: number | null = null;
      if (isOwnTransaction) {
        connectionDegree = 0; // Self
      } else if (firstDegree.has(tx.fromUserId!) || firstDegree.has(tx.toUserId!)) {
        connectionDegree = 1;
      } else if (secondDegree.has(tx.fromUserId!) || secondDegree.has(tx.toUserId!)) {
        connectionDegree = 2;
      }

      return {
        id: tx.id,
        fromUsername: tx.fromUser!.username,
        toUsername: tx.toUser!.username,
        amount: Number(tx.amount),
        memo: tx.memo,
        isPublic: tx.isPublic,
        createdAt: tx.createdAt,
        isOwnTransaction,
        connectionDegree,
      };
    });

    return {
      success: true,
      data: {
        items,
        total,
        page,
        pageSize,
        hasMore: transactions.length === pageSize,
        nextCursor: transactions.length > 0 
          ? transactions[transactions.length - 1].createdAt.toISOString()
          : null,
        // Network stats for debugging/display
        networkStats: {
          firstDegreeCount: firstDegree.size,
          secondDegreeCount: secondDegree.size,
        },
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

    socket.on('error', (error: Error) => {
      clearInterval(interval);
      request.log.error(error, 'WebSocket error');
    });
  });
};

