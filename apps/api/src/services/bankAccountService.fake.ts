/**
 * Fake Bank Account Service
 * 
 * Handles fake bank account operations for alpha/staging testing.
 * Creates instantly verified accounts with instant load/redeem.
 * 
 * This service is only available when BANK_SERVICE_MODE=fake or in staging environments.
 */

import { BankAccount, User } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import type {
  IBankAccountService,
  CreateBankAccountInput,
  BankAccountResult,
  LoadRedeemResult,
} from './bankAccountService.js';

export class FakeBankAccountService implements IBankAccountService {
  isAvailable(): boolean {
    // Fake service is available when explicitly enabled or in staging
    const mode = process.env.BANK_SERVICE_MODE;
    const nodeEnv = process.env.NODE_ENV;
    
    return mode === 'fake' || nodeEnv === 'staging' || nodeEnv === 'development';
  }

  async createAccount(
    input: CreateBankAccountInput,
    _user: User,
    request: any
  ): Promise<BankAccountResult> {
    const {
      userId,
      institutionName = 'Test Bank',
      accountName = 'Test Checking Account',
      accountType = 'CHECKING',
    } = input;

    // Generate fake account details
    const fakeRoutingNumber = '110000000';
    const fakeAccountNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();
    const accountMask = fakeAccountNumber.slice(-4);

    const bankAccount = await prisma.bankAccount.create({
      data: {
        userId,
        routingNumber: fakeRoutingNumber,
        accountNumberLast4: accountMask,
        institutionName,
        accountName,
        accountMask,
        accountType: accountType.toLowerCase(),
        status: 'verified',
        verifiedAt: new Date(),
        metadata: {
          isFake: true,
          createdFor: 'alpha_testing',
          fakeAccountNumber: fakeAccountNumber,
        },
      },
    });

    request.log.info(
      { bankAccountId: bankAccount.id, userId },
      'Fake bank account created for alpha testing'
    );

    return {
      id: bankAccount.id,
      institutionName: bankAccount.institutionName,
      accountName: bankAccount.accountName,
      accountMask: bankAccount.accountMask,
      accountType: bankAccount.accountType,
      status: bankAccount.status,
      verifiedAt: bankAccount.verifiedAt,
      isFake: true,
      message: 'Fake bank account created for testing. You can now load and redeem money instantly!',
    };
  }

  async processLoad(
    bankAccount: BankAccount,
    user: User,
    amount: number,
    idempotencyKey: string,
    request: any
  ): Promise<LoadRedeemResult> {
    // Fake accounts complete instantly
    request.log.info(
      { amount, userId: user.id, bankAccountId: bankAccount.id },
      'Fake account load - instant completion'
    );

    return {
      externalTransactionId: `fake-load-${idempotencyKey}`,
      transactionStatus: 'completed',
      isInstant: true,
    };
  }

  async processRedeem(
    bankAccount: BankAccount,
    user: User,
    amount: number,
    idempotencyKey: string,
    request: any
  ): Promise<LoadRedeemResult> {
    // Fake accounts complete instantly
    request.log.info(
      { amount, userId: user.id, bankAccountId: bankAccount.id },
      'Fake account redeem - instant completion'
    );

    return {
      externalTransactionId: `fake-redeem-${idempotencyKey}`,
      transactionStatus: 'completed',
      isInstant: true,
    };
  }
}

