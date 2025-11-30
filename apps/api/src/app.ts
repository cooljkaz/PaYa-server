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
import { readFileSync } from 'fs';

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

  // Static files (assets only, not dashboard)
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  await app.register(fastifyStatic, {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/public/assets/',
  });

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
  app.setErrorHandler((error: unknown, request, reply) => {
    request.log.error(error);

    // Type guard for error objects
    const err = error as Error & { 
      name?: string; 
      code?: string; 
      statusCode?: number;
      message?: string;
    };

    // Zod validation errors
    if (err.name === 'ZodError') {
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
    if (err.name === 'UnauthorizedError' || err.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    // Default error
    const statusCode = err.statusCode || 500;
    return reply.status(statusCode).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'production' 
          ? 'An unexpected error occurred' 
          : err.message || 'Unknown error',
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

  // Dashboard login endpoint (sets cookie)
  app.post('/public/dashboard/login', async (request, reply) => {
    try {
      const body = request.body as { token?: string };
      if (!body.token) {
        return reply.status(400).send({
          success: false,
          error: { message: 'Token required' },
        });
      }

      // Verify token is valid
      try {
        await app.jwt.verify<{ userId: string; username: string }>(body.token);
        
        // Set cookie with token (15 min expiry, same as JWT)
        reply.setCookie('paya_dashboard_token', body.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 15 * 60, // 15 minutes
          path: '/',
        });

        return {
          success: true,
          data: { message: 'Logged in successfully' },
        };
      } catch (err) {
        return reply.status(401).send({
          success: false,
          error: { message: 'Invalid token' },
        });
      }
    } catch (err) {
      return reply.status(400).send({
        success: false,
        error: { message: 'Invalid request' },
      });
    }
  });

  // Protected dashboard route - checks for JWT in cookie
  app.get('/public/dashboard.html', async (request, reply) => {
    // Check for token in cookie
    const token = request.cookies['paya_dashboard_token'];

    if (!token) {
      // No token - return HTML with login prompt
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const dashboardPath = path.join(__dirname, '..', 'public', 'dashboard.html');
      const dashboardHtml = readFileSync(dashboardPath, 'utf-8');
      
      reply.type('text/html').status(401);
      return dashboardHtml;
    }

    // Verify token
    try {
      // Temporarily set token in header for jwtVerify
      request.headers.authorization = `Bearer ${token}`;
      await request.jwtVerify();
      
      // Token is valid - serve dashboard
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const dashboardPath = path.join(__dirname, '..', 'public', 'dashboard.html');
      const dashboardHtml = readFileSync(dashboardPath, 'utf-8');
      
      reply.type('text/html');
      return dashboardHtml;
    } catch (err) {
      // Invalid token - clear cookie and return 401
      reply.clearCookie('paya_dashboard_token');
      
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const dashboardPath = path.join(__dirname, '..', 'public', 'dashboard.html');
      const dashboardHtml = readFileSync(dashboardPath, 'utf-8');
      
      reply.type('text/html').status(401);
      return dashboardHtml;
    }
  });

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

