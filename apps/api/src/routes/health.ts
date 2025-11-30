import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  // Basic health check
  app.get('/', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  });

  // Detailed health check (for monitoring)
  app.get('/detailed', async (_request, reply) => {
    const checks: Record<string, { status: string; latency?: number; error?: string }> = {};

    // Check PostgreSQL
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok', latency: Date.now() - dbStart };
    } catch (err) {
      checks.database = { status: 'error', error: (err as Error).message };
    }

    // Check Redis
    const redisStart = Date.now();
    try {
      await redis.ping();
      checks.redis = { status: 'ok', latency: Date.now() - redisStart };
    } catch (err) {
      checks.redis = { status: 'error', error: (err as Error).message };
    }

    const allOk = Object.values(checks).every((c) => c.status === 'ok');

    return reply.status(allOk ? 200 : 503).send({
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    });
  });
};

