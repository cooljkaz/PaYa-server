// ============================================
// Core Domain Types for PaYa
// ============================================

// -------------------- User --------------------

export type UserStatus = 'active' | 'frozen' | 'suspended' | 'deleted';

export type UserFlag =
  | 'fraud_review'
  | 'reward_ineligible'
  | 'new_account'
  | 'high_risk';

export interface User {
  id: string;
  username: string;
  phoneLastFour: string;
  status: UserStatus;
  flags: UserFlag[];
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt: Date | null;
}

export interface UserPublic {
  id: string;
  username: string;
}

// -------------------- Wallet --------------------

export interface Wallet {
  id: string;
  userId: string;
  balance: number; // Integer tokens only
  totalLoaded: number;
  totalSent: number;
  totalReceived: number;
  totalRedeemed: number;
  totalRewards: number;
  createdAt: Date;
  updatedAt: Date;
}

// -------------------- Bank Account --------------------

export type BankAccountStatus = 'pending' | 'verified' | 'failed' | 'removed';

export interface BankAccount {
  id: string;
  userId: string;
  institutionName: string | null;
  accountName: string | null;
  accountMask: string | null; // Last 4 digits
  accountType: 'checking' | 'savings' | null;
  status: BankAccountStatus;
  verifiedAt: Date | null;
  createdAt: Date;
}

// -------------------- Transaction --------------------

export type TransactionType =
  | 'load'
  | 'payment'
  | 'redemption'
  | 'reward'
  | 'fee'
  | 'adjustment';

export type TransactionStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface Transaction {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  fromUserId: string | null;
  toUserId: string | null;
  amount: number; // Always positive integer
  feeAmount: number;
  memo: string | null;
  isPublic: boolean;
  createdAt: Date;
  completedAt: Date | null;
}

// For the public feed
export interface FeedItem {
  id: string;
  fromUsername: string;
  toUsername: string;
  amount: number;
  memo: string | null;
  createdAt: Date;
}

// -------------------- Weekly Cycle --------------------

export type WeeklyCycleStatus =
  | 'open'
  | 'calculating'
  | 'distributed'
  | 'finalized';

export interface WeeklyCycle {
  id: string;
  weekNumber: number; // e.g., 202448
  startsAt: Date;
  endsAt: Date;
  totalRevenue: number; // In cents
  opsAllocation: number;
  userPool: number;
  remainder: number;
  activeUserCount: number;
  perUserReward: number;
  status: WeeklyCycleStatus;
  distributedAt: Date | null;
}

// -------------------- Transparency Dashboard --------------------

export interface TransparencyData {
  reserveUsdCents: number;
  totalTokensInCirculation: number;
  lastWeekRevenue: number;
  lastWeekOpsAllocation: number;
  lastWeekUserPool: number;
  lastWeekActiveUsers: number;
  lastWeekPerUserReward: number;
  updatedAt: Date;
}

// -------------------- API Response Types --------------------

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// -------------------- Session --------------------

export interface Session {
  id: string;
  userId: string;
  deviceId: string | null;
  deviceName: string | null;
  devicePlatform: 'ios' | 'android' | 'web' | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
}

