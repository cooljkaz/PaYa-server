import crypto from 'crypto';
import { SESSION } from '@paya/shared';

/**
 * Generate a random numeric OTP
 */
export function generateOtp(length: number = SESSION.OTP_LENGTH): string {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[crypto.randomInt(0, 10)];
  }
  return otp;
}

/**
 * Hash phone number for storage
 */
export function hashPhone(phone: string): string {
  const salt = process.env.PHONE_HASH_SALT || 'paya-phone-salt';
  return crypto.createHash('sha256').update(`${salt}:${phone}`).digest('hex');
}

/**
 * Generate a unique idempotency key
 */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

/**
 * Calculate ISO week number from date
 * Returns format like 202448 for week 48 of 2024
 */
export function getWeekNumber(date: Date = new Date()): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return d.getUTCFullYear() * 100 + weekNo;
}

/**
 * Get start and end of current week (Monday 00:00 to Sunday 23:59:59)
 */
export function getWeekBounds(date: Date = new Date()): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  
  const start = new Date(d.setDate(diff));
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  
  return { start, end };
}

/**
 * Check if a date falls within the new account period
 */
export function isNewAccount(createdAt: Date, coolingPeriodDays: number): boolean {
  const now = new Date();
  const accountAge = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  return accountAge < coolingPeriodDays;
}

/**
 * Format tokens for display (always whole numbers)
 */
export function formatTokens(amount: number | bigint): string {
  return Number(amount).toLocaleString('en-US');
}

/**
 * Convert cents to dollars for display
 */
export function formatUsd(cents: number | bigint): string {
  return (Number(cents) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

