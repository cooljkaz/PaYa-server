import 'dotenv/config';
import { buildApp } from './app.js';
import { logger } from './lib/logger.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  // Log environment configuration at startup (without exposing secrets)
  logger.info({
    nodeEnv: process.env.NODE_ENV,
    hasPlaidClientId: !!process.env.PLAID_CLIENT_ID,
    hasPlaidSecret: !!process.env.PLAID_SECRET,
    plaidEnv: process.env.PLAID_ENV,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasRedisUrl: !!process.env.REDIS_URL,
  }, 'Server startup configuration');

  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    logger.info(`🚀 PaYa API running at http://${HOST}:${PORT}`);
    logger.info(`📚 Health check: http://${HOST}:${PORT}/health`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
const signals = ['SIGINT', 'SIGTERM'] as const;
signals.forEach((signal) => {
  process.on(signal, async () => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    process.exit(0);
  });
});

main();

