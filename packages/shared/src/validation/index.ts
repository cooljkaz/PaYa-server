import { z } from 'zod';
import { VALIDATION, MIN_TRANSFER_AMOUNT, MAX_TRANSFER_AMOUNT } from '../constants/index.js';

// ============================================
// Zod Schemas for PaYa
// Used for validation on both client and server
// ============================================

// -------------------- Auth --------------------

export const phoneSchema = z
  .string()
  .regex(VALIDATION.PHONE_PATTERN, 'Invalid US phone number. Format: +1XXXXXXXXXX');

export const otpSchema = z
  .string()
  .length(6, 'OTP must be 6 digits')
  .regex(/^[0-9]+$/, 'OTP must be numeric');

export const usernameSchema = z
  .string()
  .min(VALIDATION.USERNAME_MIN_LENGTH, `Username must be at least ${VALIDATION.USERNAME_MIN_LENGTH} characters`)
  .max(VALIDATION.USERNAME_MAX_LENGTH, `Username must be at most ${VALIDATION.USERNAME_MAX_LENGTH} characters`)
  .regex(VALIDATION.USERNAME_PATTERN, 'Username can only contain lowercase letters, numbers, and underscores')
  .transform((val) => val.toLowerCase());

// -------------------- Auth Requests --------------------

export const requestOtpSchema = z.object({
  phone: phoneSchema,
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  otp: otpSchema,
  deviceId: z.string().optional(),
  deviceName: z.string().optional(),
  devicePlatform: z.enum(['ios', 'android', 'web']).optional(),
});

export const registerSchema = z.object({
  phone: phoneSchema,
  otp: otpSchema,
  username: usernameSchema,
  deviceId: z.string().optional(),
  deviceName: z.string().optional(),
  devicePlatform: z.enum(['ios', 'android', 'web']).optional(),
});

// -------------------- Transfer --------------------

export const memoSchema = z
  .string()
  .max(VALIDATION.MEMO_MAX_LENGTH, `Memo must be at most ${VALIDATION.MEMO_MAX_LENGTH} characters`)
  .optional()
  .nullable();

export const transferAmountSchema = z
  .number()
  .int('Amount must be a whole number')
  .min(MIN_TRANSFER_AMOUNT, `Minimum transfer is ${MIN_TRANSFER_AMOUNT} token`)
  .max(MAX_TRANSFER_AMOUNT, `Maximum transfer is ${MAX_TRANSFER_AMOUNT} tokens`);

export const sendPaymentSchema = z.object({
  toUsername: usernameSchema,
  amount: transferAmountSchema,
  memo: memoSchema,
  isPublic: z.boolean().default(true),
  idempotencyKey: z.string().uuid().optional(),
});

// -------------------- Load / Redeem --------------------

export const loadMoneySchema = z.object({
  amount: z
    .number()
    .int('Amount must be a whole number')
    .min(1, 'Minimum load is $1')
    .max(10_000, 'Maximum load is $10,000'),
  idempotencyKey: z.string().uuid().optional(),
});

export const redeemMoneySchema = z.object({
  amount: z
    .number()
    .int('Amount must be a whole number')
    .min(1, 'Minimum redemption is 1 token'),
  idempotencyKey: z.string().uuid().optional(),
});

// -------------------- Pagination --------------------

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const feedQuerySchema = paginationSchema.extend({
  before: z.string().datetime().optional(), // Cursor for infinite scroll
});

// -------------------- Type Exports --------------------

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type SendPaymentInput = z.infer<typeof sendPaymentSchema>;
export type LoadMoneyInput = z.infer<typeof loadMoneySchema>;
export type RedeemMoneyInput = z.infer<typeof redeemMoneySchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type FeedQueryInput = z.infer<typeof feedQuerySchema>;

