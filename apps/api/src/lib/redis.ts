import Redis from 'ioredis';
import { logger } from './logger.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis error');
});

// Helper functions for common Redis operations

/**
 * Store OTP code with expiry
 */
export async function storeOtp(phone: string, otp: string, expirySeconds: number): Promise<void> {
  const key = `otp:${phone}`;
  await redis.setex(key, expirySeconds, otp);
}

/**
 * Get OTP code without consuming it (for dev/debugging)
 */
export async function getOtp(phone: string): Promise<string | null> {
  const key = `otp:${phone}`;
  return await redis.get(key);
}

/**
 * Verify and consume OTP code
 */
export async function verifyOtp(phone: string, otp: string): Promise<boolean> {
  const key = `otp:${phone}`;
  const stored = await redis.get(key);
  
  if (stored === otp) {
    await redis.del(key);
    return true;
  }
  
  return false;
}

/**
 * Rate limit check using sliding window
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = now - windowMs;

  // Remove old entries
  await redis.zremrangebyscore(key, 0, windowStart);

  // Count current entries
  const count = await redis.zcard(key);

  if (count >= limit) {
    const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
    const resetAt = oldest.length > 1 ? parseInt(oldest[1]) + windowMs : now + windowMs;
    
    return {
      allowed: false,
      remaining: 0,
      resetAt,
    };
  }

  // Add new entry
  await redis.zadd(key, now, `${now}`);
  await redis.expire(key, windowSeconds);

  return {
    allowed: true,
    remaining: limit - count - 1,
    resetAt: now + windowMs,
  };
}

/**
 * Simple cache get/set
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

export async function cacheSet(key: string, value: unknown, expirySeconds?: number): Promise<void> {
  const data = JSON.stringify(value);
  if (expirySeconds) {
    await redis.setex(key, expirySeconds, data);
  } else {
    await redis.set(key, data);
  }
}

