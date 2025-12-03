/**
 * Real Bank Account Service
 * 
 * Handles real bank account operations using Plaid and Synctera.
 * This is the production implementation.
 */

import { BankAccount, User } from '@prisma/client';
import { synctera, SyncteraError } from '../lib/synctera.js';
import { plaid } from '../lib/plaid.js';
import { prisma } from '../lib/prisma.js';
import type {
  IBankAccountService,
  CreateBankAccountInput,
  BankAccountResult,
  LoadRedeemResult,
} from './bankAccountService.js';

/**
 * Ensure user has Synctera customer and internal wallet account
 */
async function ensureSyncteraWalletAccount(
  userId: string,
  username: string,
  phoneLastFour: string,
  request: any
): Promise<{ customerId: string; accountId: string } | null> {
  if (!synctera.isConfigured()) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { syncteraCustomerId: true, syncteraAccountId: true },
  });

  if (!user) {
    return null;
  }

  if (user.syncteraCustomerId && user.syncteraAccountId) {
    return {
      customerId: user.syncteraCustomerId,
      accountId: user.syncteraAccountId,
    };
  }

  try {
    let syncteraCustomerId = user.syncteraCustomerId;
    if (!syncteraCustomerId) {
      const customer = await synctera.createCustomer({
        first_name: username,
        last_name: 'User',
        phone_number: `+1${phoneLastFour}000000`,
      });
      syncteraCustomerId = customer.id;
      await prisma.user.update({
        where: { id: userId },
        data: { syncteraCustomerId },
      });
      request.log.info({ userId, customerId: syncteraCustomerId }, 'Created Synctera customer');
    }

    let syncteraAccountId = user.syncteraAccountId;
    if (!syncteraAccountId) {
      const account = await synctera.createAccount(syncteraCustomerId);
      syncteraAccountId = account.id;
      await prisma.user.update({
        where: { id: userId },
        data: { syncteraAccountId },
      });
      request.log.info({ userId, accountId: syncteraAccountId }, 'Created Synctera wallet account');
    }

    return {
      customerId: syncteraCustomerId,
      accountId: syncteraAccountId,
    };
  } catch (error) {
    request.log.error({ userId, error }, 'Failed to create Synctera wallet account');
    throw error;
  }
}

export class RealBankAccountService implements IBankAccountService {
  isAvailable(): boolean {
    // Real service is available if Synctera or Plaid is configured
    return synctera.isConfigured() || plaid.isConfigured();
  }

  async createAccount(
    input: CreateBankAccountInput,
    user: User,
    request: any
  ): Promise<BankAccountResult> {
    const { userId, institutionName, accountName, accountType, routingNumber, accountNumber } = input;

    // This should only be called for manual entry (Plaid has its own flow)
    if (!routingNumber || !accountNumber) {
      throw new Error('Routing number and account number required for real bank accounts');
    }

    let syncteraExternalAccountId: string | null = null;

    if (synctera.isConfigured()) {
      const syncteraInfo = await ensureSyncteraWalletAccount(
        userId,
        user.username,
        user.phoneLastFour,
        request
      );

      if (syncteraInfo) {
        const externalAccount = await synctera.createExternalAccount({
          customer_id: syncteraInfo.customerId,
          account_owner_names: [user.username],
          routing_number: routingNumber,
          account_number: accountNumber,
          account_type: accountType,
        });

        syncteraExternalAccountId = externalAccount.id;
        await synctera.initiateMicroDeposits(externalAccount.id);
      }
    }

    const bankAccount = await prisma.bankAccount.create({
      data: {
        userId,
        syncteraExternalAccountId,
        routingNumber,
        accountNumberLast4: accountNumber.slice(-4),
        institutionName: institutionName || 'Bank',
        accountName: accountName || `${accountType} Account`,
        accountMask: accountNumber.slice(-4),
        accountType: accountType.toLowerCase(),
        status: 'verification_pending',
        metadata: {},
      },
    });

    request.log.info({ bankAccountId: bankAccount.id }, 'Real bank account created, pending verification');

    return {
      id: bankAccount.id,
      institutionName: bankAccount.institutionName,
      accountName: bankAccount.accountName,
      accountMask: bankAccount.accountMask,
      accountType: bankAccount.accountType,
      status: bankAccount.status,
      verifiedAt: bankAccount.verifiedAt,
      isFake: false,
      message: 'Bank account added. Please verify with micro-deposits (3-5 business days).',
    };
  }

  async processLoad(
    bankAccount: BankAccount,
    user: User,
    amount: number,
    idempotencyKey: string,
    request: any
  ): Promise<LoadRedeemResult> {
    let externalTransactionId: string | null = null;
    let transactionStatus: 'pending' | 'completed' = 'pending';

    if (synctera.isConfigured() && bankAccount.syncteraExternalAccountId && user.syncteraAccountId) {
      try {
        const achTransfer = await synctera.initiateACHPull({
          amount: amount * 100, // Convert to cents
          originating_account_id: bankAccount.syncteraExternalAccountId,
          receiving_account_id: user.syncteraAccountId,
          memo: `PaYa load - ${idempotencyKey}`,
        });

        externalTransactionId = achTransfer.id;
        request.log.info({ achId: achTransfer.id, amount }, 'ACH pull initiated');
      } catch (error) {
        if (error instanceof SyncteraError) {
          request.log.error({ error: error.message }, 'ACH pull failed');
          throw new Error('TRANSFER_FAILED');
        }
        throw error;
      }
    } else if (process.env.NODE_ENV === 'development') {
      // Development mode fallback - auto-complete
      transactionStatus = 'completed';
    }

    return {
      externalTransactionId,
      transactionStatus,
      isInstant: false,
    };
  }

  async processRedeem(
    bankAccount: BankAccount,
    user: User,
    amount: number,
    idempotencyKey: string,
    request: any
  ): Promise<LoadRedeemResult> {
    let externalTransactionId: string | null = null;
    let transactionStatus: 'pending' | 'completed' = 'pending';

    if (synctera.isConfigured() && bankAccount.syncteraExternalAccountId && user.syncteraAccountId) {
      try {
        const achTransfer = await synctera.initiateACHPush({
          amount: amount * 100,
          originating_account_id: user.syncteraAccountId,
          receiving_account_id: bankAccount.syncteraExternalAccountId,
          memo: `PaYa redemption - ${idempotencyKey}`,
        });

        externalTransactionId = achTransfer.id;
        request.log.info({ achId: achTransfer.id, amount }, 'ACH push initiated');
      } catch (error) {
        if (error instanceof SyncteraError) {
          request.log.error({ error: error.message }, 'ACH push failed');
          throw new Error('TRANSFER_FAILED');
        }
        throw error;
      }
    } else if (process.env.NODE_ENV === 'development') {
      transactionStatus = 'completed';
    }

    return {
      externalTransactionId,
      transactionStatus,
      isInstant: false,
    };
  }
}

