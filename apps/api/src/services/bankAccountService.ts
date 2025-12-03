/**
 * Bank Account Service Interface
 * 
 * Abstract interface for bank account operations.
 * Allows swapping between real and fake implementations based on environment.
 */

import { BankAccount, User } from '@prisma/client';

export interface CreateBankAccountInput {
  userId: string;
  institutionName?: string;
  accountName?: string;
  accountType: 'CHECKING' | 'SAVINGS';
  routingNumber?: string;
  accountNumber?: string;
  accountNumberLast4?: string;
  accountMask?: string;
}

export interface BankAccountResult {
  id: string;
  institutionName: string | null;
  accountName: string | null;
  accountMask: string | null;
  accountType: string | null;
  status: string;
  verifiedAt: Date | null;
  isFake: boolean;
  message: string;
}

export interface LoadRedeemResult {
  externalTransactionId: string | null;
  transactionStatus: 'pending' | 'completed';
  isInstant: boolean;
}

/**
 * Bank Account Service Interface
 */
export interface IBankAccountService {
  /**
   * Create a bank account
   */
  createAccount(
    input: CreateBankAccountInput,
    user: User,
    request: any
  ): Promise<BankAccountResult>;

  /**
   * Process a load transaction (money from bank to wallet)
   */
  processLoad(
    bankAccount: BankAccount,
    user: User,
    amount: number,
    idempotencyKey: string,
    request: any
  ): Promise<LoadRedeemResult>;

  /**
   * Process a redeem transaction (money from wallet to bank)
   */
  processRedeem(
    bankAccount: BankAccount,
    user: User,
    amount: number,
    idempotencyKey: string,
    request: any
  ): Promise<LoadRedeemResult>;

  /**
   * Check if this service is available/configured
   */
  isAvailable(): boolean;
}

