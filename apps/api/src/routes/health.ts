import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { plaid } from '../lib/plaid.js';

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

  // Debug endpoint to check environment configuration (without exposing secrets)
  app.get('/debug', async () => {
    const hasTwilio = !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
    );
    
    return {
      nodeEnv: process.env.NODE_ENV,
      hasPlaidClientId: !!process.env.PLAID_CLIENT_ID,
      hasPlaidSecret: !!process.env.PLAID_SECRET,
      plaidEnv: process.env.PLAID_ENV,
      plaidConfigured: plaid.isConfigured(),
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      hasRedisUrl: !!process.env.REDIS_URL,
      hasJwtAccessSecret: !!process.env.JWT_ACCESS_SECRET,
      hasJwtRefreshSecret: !!process.env.JWT_REFRESH_SECRET,
      // Twilio
      hasTwilioAccountSid: !!process.env.TWILIO_ACCOUNT_SID,
      hasTwilioAuthToken: !!process.env.TWILIO_AUTH_TOKEN,
      hasTwilioPhoneNumber: !!process.env.TWILIO_PHONE_NUMBER,
      twilioConfigured: hasTwilio,
      twilioPhonePrefix: process.env.TWILIO_PHONE_NUMBER?.slice(0, 5) || null,
      timestamp: new Date().toISOString(),
    };
  });

  // JWT test endpoint - signs and verifies a test token to check JWT is working
  app.get('/jwt-test', async () => {
    try {
      // Sign a test token
      const testPayload = { userId: 'test-user-123', username: 'testuser' };
      const testToken = app.jwt.sign(testPayload);
      
      // Verify the test token
      const decoded = app.jwt.verify<{ userId: string; username: string }>(testToken);
      
      return {
        success: true,
        message: 'JWT signing and verification working correctly',
        tokenPrefix: testToken.substring(0, 30) + '...',
        decodedPayload: decoded,
        secretLength: process.env.JWT_ACCESS_SECRET?.length || 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        errorName: error.name,
        hasJwtSecret: !!process.env.JWT_ACCESS_SECRET,
        secretLength: process.env.JWT_ACCESS_SECRET?.length || 0,
      };
    }
  });

  // Token verification test - verify a provided token
  app.post<{ Body: { token: string } }>('/verify-token', async (request) => {
    const { token } = request.body;
    
    if (!token) {
      return { success: false, error: 'Token required' };
    }
    
    try {
      const decoded = app.jwt.verify<{ userId: string; username: string }>(token);
      return {
        success: true,
        decoded,
        tokenPrefix: token.substring(0, 30) + '...',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        errorName: error.name,
        tokenPrefix: token.substring(0, 30) + '...',
      };
    }
  });
};

