import pino from 'pino';
import type { FastifyLoggerOptions } from 'fastify';
import type { PinoLoggerOptions } from 'fastify/types/logger.js';

// Logger configuration for Fastify
export const loggerConfig: FastifyLoggerOptions & PinoLoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
};

// Standalone logger instance for non-Fastify use (e.g., Prisma, scripts)
export const logger = pino(loggerConfig);

