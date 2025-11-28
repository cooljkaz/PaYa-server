// ============================================
// System Constants for PaYa
// ============================================

// -------------------- Token Economics --------------------

/** 1 token = $1 USD (100 cents) */
export const TOKEN_TO_CENTS = 100;

/** Minimum token amount for any transfer */
export const MIN_TRANSFER_AMOUNT = 1;

/** Maximum single transfer amount */
export const MAX_TRANSFER_AMOUNT = 10_000;

// -------------------- Redemption --------------------

/** Free redemption limit per week (in tokens) */
export const FREE_REDEMPTION_LIMIT = 100;

/** Flat fee for redemptions above the free limit (in cents) */
export const OVER_LIMIT_REDEMPTION_FEE_CENTS = 300; // $3.00

// -------------------- Rate Limits --------------------

export const RATE_LIMITS = {
  /** Max sends per hour per user */
  SENDS_PER_HOUR: 10,

  /** Max sends per day per user */
  SENDS_PER_DAY: 50,

  /** Max unique recipients per day */
  UNIQUE_RECIPIENTS_PER_DAY: 20,

  /** Max load amount per week (in tokens) */
  LOAD_PER_WEEK: 2_000,

  /** Max API requests per minute */
  API_REQUESTS_PER_MINUTE: 100,
} as const;

// -------------------- New Account Restrictions --------------------

export const NEW_ACCOUNT = {
  /** Days before a new account can redeem */
  NO_REDEEM_DAYS: 14,

  /** Days before account is eligible for rewards */
  REWARD_ELIGIBILITY_DAYS: 7,

  /** Max load amount during first week */
  FIRST_WEEK_MAX_LOAD: 100,

  /** Cooling period before full features (days) */
  COOLING_PERIOD_DAYS: 7,
} as const;

// -------------------- Weekly Rewards --------------------

export const WEEKLY_REWARDS = {
  /** Percentage allocated to ops/startup (0.10 = 10%) */
  OPS_ALLOCATION_PERCENTAGE: 0.1,

  /** Minimum public payments to qualify as "active" */
  MIN_PUBLIC_PAYMENTS_FOR_ACTIVE: 1,
} as const;

// -------------------- Validation --------------------

export const VALIDATION = {
  /** Username constraints */
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 30,
  USERNAME_PATTERN: /^[a-z0-9_]+$/,

  /** Memo constraints */
  MEMO_MAX_LENGTH: 280,

  /** Phone number (US only for MVP) */
  PHONE_PATTERN: /^\+1[0-9]{10}$/,
} as const;

// -------------------- Session --------------------

export const SESSION = {
  /** Access token expiry (15 minutes) */
  ACCESS_TOKEN_EXPIRY_SECONDS: 15 * 60,

  /** Refresh token expiry (7 days) */
  REFRESH_TOKEN_EXPIRY_SECONDS: 7 * 24 * 60 * 60,

  /** OTP code expiry (5 minutes) */
  OTP_EXPIRY_SECONDS: 5 * 60,

  /** OTP code length */
  OTP_LENGTH: 6,
} as const;

// -------------------- Error Codes --------------------

export const ERROR_CODES = {
  // Auth errors
  INVALID_PHONE: 'INVALID_PHONE',
  INVALID_OTP: 'INVALID_OTP',
  OTP_EXPIRED: 'OTP_EXPIRED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  UNAUTHORIZED: 'UNAUTHORIZED',

  // User errors
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  INVALID_USERNAME: 'INVALID_USERNAME',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  ACCOUNT_FROZEN: 'ACCOUNT_FROZEN',

  // Wallet errors
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  SELF_TRANSFER: 'SELF_TRANSFER',

  // Rate limit errors
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  DAILY_LIMIT_EXCEEDED: 'DAILY_LIMIT_EXCEEDED',
  WEEKLY_LIMIT_EXCEEDED: 'WEEKLY_LIMIT_EXCEEDED',

  // Bank errors
  BANK_NOT_LINKED: 'BANK_NOT_LINKED',
  BANK_VERIFICATION_FAILED: 'BANK_VERIFICATION_FAILED',
  ACH_FAILED: 'ACH_FAILED',

  // General errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_FOUND: 'NOT_FOUND',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

