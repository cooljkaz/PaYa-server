import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';

import { loggerConfig } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { RATE_LIMITS } from '@paya/shared';
import { registerAuthMiddleware } from './middleware/auth.js';

// Routes
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/user.js';
import { walletRoutes } from './routes/wallet.js';
import { paymentRoutes } from './routes/payment.js';
import { feedRoutes } from './routes/feed.js';
import { bankRoutes } from './routes/bank.js';
import { transparencyRoutes } from './routes/transparency.js';
import { adminRoutes } from './routes/admin.js';
import { devRoutes } from './routes/dev.js';
import { webhookRoutes } from './routes/webhooks.js';

export async function buildApp() {
  const app = Fastify({
    logger: loggerConfig,
  });

  // -------------------- Plugins --------------------

  // CORS
  await app.register(cors, {
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://paya.cash'] // Production domain
      : true,
    credentials: true,
  });

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: false, // Adjust for your needs
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: RATE_LIMITS.API_REQUESTS_PER_MINUTE,
    timeWindow: '1 minute',
    redis: redis,
  });

  // JWT
  await app.register(jwt, {
    secret: process.env.JWT_ACCESS_SECRET || 'dev-secret-change-me',
    sign: {
      expiresIn: '15m',
    },
  });

  // Cookies (for refresh tokens)
  await app.register(cookie, {
    secret: process.env.JWT_REFRESH_SECRET || 'dev-cookie-secret',
  });

  // WebSocket (for real-time feed)
  await app.register(websocket);

  // Static files (dev dashboard)
  if (process.env.NODE_ENV !== 'production') {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    await app.register(fastifyStatic, {
      root: path.join(__dirname, '..', 'public'),
      prefix: '/dashboard/',
    });
  }

  // -------------------- Decorators --------------------

  // Add Prisma to request context
  app.decorate('prisma', prisma);
  app.decorate('redis', redis);

  // Register authentication middleware
  await registerAuthMiddleware(app);

  // -------------------- Hooks --------------------

  // Request logging
  app.addHook('onRequest', async (request) => {
    request.log.info({ url: request.url, method: request.method }, 'incoming request');
  });

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    // Zod validation errors
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error,
        },
      });
    }

    // JWT errors
    if (error.name === 'UnauthorizedError' || error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    // Default error
    const statusCode = error.statusCode || 500;
    return reply.status(statusCode).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'production' 
          ? 'An unexpected error occurred' 
          : error.message,
      },
    });
  });

  // -------------------- Routes --------------------

  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(userRoutes, { prefix: '/users' });
  await app.register(walletRoutes, { prefix: '/wallet' });
  await app.register(paymentRoutes, { prefix: '/payments' });
  await app.register(feedRoutes, { prefix: '/feed' });
  await app.register(bankRoutes, { prefix: '/bank' });
  await app.register(transparencyRoutes, { prefix: '/transparency' });
  await app.register(adminRoutes, { prefix: '/admin' });
  await app.register(devRoutes, { prefix: '/dev' });
  await app.register(webhookRoutes, { prefix: '/webhooks' });

  // Root route
  app.get('/', async () => {
    return {
      name: 'PaYa API',
      version: '0.1.0',
      docs: '/docs',
    };
  });

  // -------------------- Lifecycle --------------------

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });

  return app;
}

// Type augmentation for Fastify
declare module 'fastify' {
  interface FastifyInstance {
    prisma: typeof prisma;
    redis: typeof redis;
  }
}

