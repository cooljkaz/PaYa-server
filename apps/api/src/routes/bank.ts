import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { synctera, SyncteraError } from '../lib/synctera.js';
import { plaid, PlaidError } from '../lib/plaid.js';
import { 
  loadMoneySchema, 
  redeemMoneySchema,
  type LoadMoneyInput,
  type RedeemMoneyInput,
  ERROR_CODES,
  FREE_REDEMPTION_LIMIT,
  OVER_LIMIT_REDEMPTION_FEE_CENTS,
  NEW_ACCOUNT,
  RATE_LIMITS,
} from '@paya/shared';
import { checkRateLimit } from '../lib/redis.js';
import { generateIdempotencyKey, isNewAccount } from '../lib/utils.js';
import { getBankAccountService, isFakeBankAccountServiceAvailable } from '../services/bankAccountService.factory.js';
import { FakeBankAccountService } from '../services/bankAccountService.fake.js';

/**
 * Ensure user has Synctera customer and internal wallet account
 * Called when user first links a bank account
 * Creates customer + internal account if they don't exist
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

  // Check current state
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { syncteraCustomerId: true, syncteraAccountId: true },
  });

  if (!user) {
    return null;
  }

  // If already fully set up, return existing IDs
  if (user.syncteraCustomerId && user.syncteraAccountId) {
    return {
      customerId: user.syncteraCustomerId,
      accountId: user.syncteraAccountId,
    };
  }

  try {
    // Step 1: Ensure customer exists
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

    // Step 2: Ensure internal wallet account exists
    let syncteraAccountId = user.syncteraAccountId;
    if (!syncteraAccountId) {
      // Account type is defined by SYNCTERA_ACCOUNT_TEMPLATE_ID
      // This should be a simple checking/wallet account
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

// Input types
interface PlaidExchangeInput {
  publicToken: string;
  accountId: string; // Selected account from Plaid Link
}

interface ManualLinkInput {
  accountOwnerName: string;
  routingNumber: string;
  accountNumber: string;
  accountType: 'CHECKING' | 'SAVINGS';
  institutionName?: string;
}

interface VerifyMicroDepositsInput {
  bankAccountId: string;
  amounts: [number, number]; // Two micro-deposit amounts in cents
}

interface CreateFakeBankAccountInput {
  institutionName?: string;
  accountName?: string;
  accountType?: 'CHECKING' | 'SAVINGS';
}

// Schema for fake bank account creation
const createFakeAccountSchema = z.object({
  institutionName: z.string().optional(),
  accountName: z.string().optional(),
  accountType: z.enum(['CHECKING', 'SAVINGS']).optional(),
});

export const bankRoutes: FastifyPluginAsync = async (app) => {
  // All routes require authentication
  app.addHook('preValidation', app.authenticate);

  /**
   * GET /bank/accounts
   * Get user's linked bank accounts
   */
  app.get('/accounts', async (request) => {
    const accounts = await prisma.bankAccount.findMany({
      where: {
        userId: request.userId,
        status: { not: 'removed' },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: accounts.map(acc => {
        // Type assertion needed because Prisma Json type isn't fully typed
        const metadata = (acc as any).metadata as any;
        return {
          id: acc.id,
          institutionName: acc.institutionName,
          accountName: acc.accountName,
          accountMask: acc.accountMask,
          accountType: acc.accountType,
          status: acc.status,
          verifiedAt: acc.verifiedAt,
          createdAt: acc.createdAt,
          isFake: metadata?.isFake === true,
        };
      }),
    };
  });

  // ==================== FAKE BANK ACCOUNT (Alpha Testing) ====================

  /**
   * POST /bank/fake/create
   * Create a fake bank account for alpha testing
   * Instantly verified, no real bank connection needed
   * Only available when BANK_SERVICE_MODE=fake or in staging/development
   */
  app.post<{ Body: CreateFakeBankAccountInput }>('/fake/create', async (request, reply) => {
    try {
      // Validate request body
      const body = createFakeAccountSchema.parse(request.body || {});
      
      request.log.info({ 
        userId: request.userId,
        body,
        nodeEnv: process.env.NODE_ENV,
        bankServiceMode: process.env.BANK_SERVICE_MODE,
      }, 'Fake bank account creation request');

      // Check if fake service is available
      if (!isFakeBankAccountServiceAvailable()) {
        request.log.warn({ 
          nodeEnv: process.env.NODE_ENV,
          bankServiceMode: process.env.BANK_SERVICE_MODE,
        }, 'Fake bank account service not available');
        
        return reply.status(403).send({
          success: false,
          error: {
            code: ERROR_CODES.FEATURE_DISABLED,
            message: 'Fake bank accounts are only available in staging/development environments',
          },
        });
      }

      const { 
        institutionName = 'Test Bank', 
        accountName = 'Test Checking Account',
        accountType = 'CHECKING' 
      } = body;

      const user = await prisma.user.findUnique({
        where: { id: request.userId },
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: {
            code: ERROR_CODES.USER_NOT_FOUND,
            message: 'User not found',
          },
        });
      }

      // Force use of fake service for this endpoint (don't use factory)
      const fakeService = new FakeBankAccountService();
      
      request.log.info({ 
        isAvailable: fakeService.isAvailable(),
        nodeEnv: process.env.NODE_ENV,
        bankServiceMode: process.env.BANK_SERVICE_MODE,
      }, 'Checking fake service availability');

      if (!fakeService.isAvailable()) {
        request.log.warn('Fake service not available');
        return reply.status(403).send({
          success: false,
          error: {
            code: ERROR_CODES.FEATURE_DISABLED,
            message: 'Fake bank accounts are only available in staging/development environments',
          },
        });
      }

      request.log.info({ userId: request.userId }, 'Creating fake bank account');

      const result = await fakeService.createAccount(
        {
          userId: request.userId,
          institutionName,
          accountName,
          accountType,
        },
        user,
        request
      );

      request.log.info({ 
        bankAccountId: result.id,
        userId: request.userId 
      }, 'Fake bank account created successfully');

      return reply.status(201).send({
        success: true,
        data: result,
      });
    } catch (error) {
      const errorDetails = {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined,
        userId: request.userId,
        body: request.body,
      };
      
      request.log.error(errorDetails, 'Failed to create fake bank account');
      
      // Handle Zod validation errors
      if (error && typeof error === 'object' && 'issues' in error) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Invalid request data',
          },
        });
      }
      
      // Check if it's a Prisma error
      if (error && typeof error === 'object' && 'code' in error) {
        const prismaError = error as { code?: string; meta?: any };
        if (prismaError.code === 'P2002') {
          return reply.status(400).send({
            success: false,
            error: {
              code: ERROR_CODES.VALIDATION_ERROR,
              message: 'Bank account already exists',
            },
          });
        }
      }
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Failed to create fake bank account';
      
      return reply.status(500).send({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: process.env.NODE_ENV === 'production' 
            ? 'Failed to create bank account'
            : errorMessage,
        },
      });
    }
  });

  // ==================== PLAID LINK FLOW (Recommended) ====================

  /**
   * POST /bank/link/create-token
   * Create a Plaid Link token for the mobile app
   */
  app.post('/link/create-token', async (request, reply) => {
    // Check if Plaid is configured
    if (!plaid.isConfigured()) {
      request.log.error({ 
        nodeEnv: process.env.NODE_ENV,
        hasPlaidClientId: !!process.env.PLAID_CLIENT_ID,
        hasPlaidSecret: !!process.env.PLAID_SECRET,
        plaidEnv: process.env.PLAID_ENV,
      }, 'Plaid not configured - credentials missing');
      
      return reply.status(500).send({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Bank linking service not configured. Please check Plaid credentials in AWS Secrets Manager.',
        },
      });
    }

    try {
      const linkToken = await plaid.createLinkToken(request.userId);

      return {
        success: true,
        data: {
          linkToken: linkToken.linkToken,
          expiration: linkToken.expiration,
        },
      };
    } catch (error) {
      if (error instanceof PlaidError) {
        request.log.error({ error: error.message, code: error.code }, 'Plaid error');
        return reply.status(400).send({
          success: false,
          error: {
            code: ERROR_CODES.BANK_LINK_FAILED,
            message: error.message,
          },
        });
      }
      throw error;
    }
  });

  /**
   * POST /bank/link/exchange
   * Exchange Plaid public token and create bank account in Synctera
   */
  app.post<{ Body: PlaidExchangeInput }>('/link/exchange', async (request, reply) => {
    const { publicToken, accountId } = request.body;

    if (!publicToken || !accountId) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'publicToken and accountId are required',
        },
      });
    }

    // Development mode - create mock account
    if (!plaid.isConfigured() && process.env.NODE_ENV === 'development') {
      const bankAccount = await prisma.bankAccount.create({
        data: {
          userId: request.userId,
          plaidAccessToken: 'mock-access-token',
          plaidAccountId: accountId,
          plaidItemId: 'mock-item-id',
          routingNumber: '110000000',
          accountNumberLast4: '1234',
          institutionName: 'Mock Bank',
          accountName: 'Checking Account',
          accountMask: '1234',
          accountType: 'checking',
          status: 'verified',
          verifiedAt: new Date(),
        },
      });

      return {
        success: true,
        data: {
          id: bankAccount.id,
          institutionName: bankAccount.institutionName,
          accountMask: bankAccount.accountMask,
          accountType: bankAccount.accountType,
          status: bankAccount.status,
          message: 'Bank account linked successfully (development mode)',
        },
      };
    }

    try {
      // Exchange public token and get account details from Plaid
      const plaidResult = await plaid.exchangePublicToken(publicToken);
      
      // Find the selected account
      const selectedAccount = plaidResult.accounts.find(a => a.accountId === accountId);
      if (!selectedAccount) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Selected account not found',
          },
        });
      }

      // Only allow checking/savings accounts
      if (!['depository'].includes(selectedAccount.accountType)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Only checking and savings accounts are supported',
          },
        });
      }

      // Get user for Synctera customer creation
      const user = await prisma.user.findUnique({
        where: { id: request.userId },
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: {
            code: ERROR_CODES.USER_NOT_FOUND,
            message: 'User not found',
          },
        });
      }

      let syncteraExternalAccountId: string | null = null;

      // If Synctera is configured, create customer + wallet + external account
      if (synctera.isConfigured()) {
        try {
          // Ensure user has Synctera customer and internal wallet account
          const syncteraInfo = await ensureSyncteraWalletAccount(
            request.userId,
            user.username,
            user.phoneLastFour,
            request
          );
          
          if (syncteraInfo) {
            // Create external account in Synctera using Plaid data
            // External account type must match user's actual bank (checking/savings)
            const externalAccount = await synctera.createExternalAccount({
              customer_id: syncteraInfo.customerId,
              account_owner_names: [selectedAccount.accountName],
              routing_number: selectedAccount.routingNumber,
              account_number: selectedAccount.accountNumber,
              account_type: selectedAccount.accountSubtype === 'savings' ? 'SAVINGS' : 'CHECKING',
            });

            syncteraExternalAccountId = externalAccount.id;
          }
        } catch (syncError) {
          request.log.error({ error: syncError }, 'Failed to create Synctera accounts');
          // Continue without Synctera - we still have the Plaid data
        }
      }

      // Create bank account record
      const bankAccount = await prisma.bankAccount.create({
        data: {
          userId: request.userId,
          plaidAccessToken: plaidResult.accessToken,
          plaidAccountId: accountId,
          plaidItemId: plaidResult.itemId,
          syncteraExternalAccountId,
          routingNumber: selectedAccount.routingNumber,
          accountNumberLast4: selectedAccount.accountNumber.slice(-4),
          institutionName: plaidResult.institution?.name || 'Bank',
          accountName: selectedAccount.accountName,
          accountMask: selectedAccount.accountMask,
          accountType: selectedAccount.accountSubtype === 'savings' ? 'savings' : 'checking',
          // Plaid-linked accounts are instantly verified!
          status: 'verified',
          verifiedAt: new Date(),
        },
      });

      request.log.info({ 
        bankAccountId: bankAccount.id, 
        institution: plaidResult.institution?.name 
      }, 'Bank account linked via Plaid');

      return {
        success: true,
        data: {
          id: bankAccount.id,
          institutionName: bankAccount.institutionName,
          accountMask: bankAccount.accountMask,
          accountType: bankAccount.accountType,
          status: bankAccount.status,
          message: 'Bank account linked successfully!',
        },
      };
    } catch (error) {
      if (error instanceof PlaidError) {
        request.log.error({ error: error.message, code: error.code }, 'Plaid exchange failed');
        return reply.status(400).send({
          success: false,
          error: {
            code: ERROR_CODES.BANK_LINK_FAILED,
            message: error.message,
          },
        });
      }
      throw error;
    }
  });

  // ==================== MANUAL LINK FLOW (Fallback) ====================

  /**
   * POST /bank/link/manual
   * Manually link a bank account (requires micro-deposit verification)
   */
  app.post<{ Body: ManualLinkInput }>('/link/manual', async (request, reply) => {
    const { accountOwnerName, routingNumber, accountNumber, accountType, institutionName } = request.body;

    // Validate input
    if (!routingNumber || routingNumber.length !== 9) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Invalid routing number. Must be 9 digits.',
        },
      });
    }

    if (!accountNumber || accountNumber.length < 4) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Invalid account number.',
        },
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: request.userId },
    });

    if (!user) {
      return reply.status(404).send({
        success: false,
        error: {
          code: ERROR_CODES.USER_NOT_FOUND,
          message: 'User not found',
        },
      });
    }

    // Development mode - auto-verify
    if (!synctera.isConfigured() && process.env.NODE_ENV === 'development') {
      const bankAccount = await prisma.bankAccount.create({
        data: {
          userId: request.userId,
          routingNumber,
          accountNumberLast4: accountNumber.slice(-4),
          institutionName: institutionName || 'Bank',
          accountName: `${accountType} Account`,
          accountMask: accountNumber.slice(-4),
          accountType: accountType.toLowerCase(),
          status: 'verified',
          verifiedAt: new Date(),
        },
      });

      return reply.status(201).send({
        success: true,
        data: {
          id: bankAccount.id,
          institutionName: bankAccount.institutionName,
          accountMask: bankAccount.accountMask,
          status: bankAccount.status,
          message: 'Bank account linked (development mode)',
        },
      });
    }

    try {
      let syncteraExternalAccountId: string | null = null;

      // If Synctera is configured, create customer + wallet + external account
      if (synctera.isConfigured()) {
        // Ensure user has Synctera customer and internal wallet account
        const syncteraInfo = await ensureSyncteraWalletAccount(
          request.userId,
          user.username,
          user.phoneLastFour,
          request
        );

        if (syncteraInfo) {
          // Create external account in Synctera
          // External account type must match user's actual bank (checking/savings)
          const externalAccount = await synctera.createExternalAccount({
            customer_id: syncteraInfo.customerId,
            account_owner_names: [accountOwnerName],
            routing_number: routingNumber,
            account_number: accountNumber,
            account_type: accountType,
          });

          syncteraExternalAccountId = externalAccount.id;

          // Initiate micro-deposit verification
          await synctera.initiateMicroDeposits(externalAccount.id);
        }
      }

      // Create bank account record
      const bankAccount = await prisma.bankAccount.create({
        data: {
          userId: request.userId,
          syncteraExternalAccountId,
          routingNumber,
          accountNumberLast4: accountNumber.slice(-4),
          institutionName: institutionName || 'Bank',
          accountName: `${accountType} Account`,
          accountMask: accountNumber.slice(-4),
          accountType: accountType.toLowerCase(),
          status: 'verification_pending',
        },
      });

      request.log.info({ bankAccountId: bankAccount.id }, 'Manual bank account created, pending verification');

      return reply.status(201).send({
        success: true,
        data: {
          id: bankAccount.id,
          institutionName: bankAccount.institutionName,
          accountMask: bankAccount.accountMask,
          status: bankAccount.status,
          message: 'Bank account added. Please verify with micro-deposits (3-5 business days).',
        },
      });
    } catch (error) {
      if (error instanceof SyncteraError) {
        request.log.error({ error: error.message }, 'Synctera error');
        return reply.status(error.statusCode).send({
          success: false,
          error: {
            code: ERROR_CODES.BANK_LINK_FAILED,
            message: error.message,
          },
        });
      }
      throw error;
    }
  });

  /**
   * POST /bank/verify-micro-deposits
   * Verify micro-deposits to complete manual bank account verification
   */
  app.post<{ Body: VerifyMicroDepositsInput }>('/verify-micro-deposits', async (request, reply) => {
    const { bankAccountId, amounts } = request.body;

    const bankAccount = await prisma.bankAccount.findFirst({
      where: {
        id: bankAccountId,
        userId: request.userId,
        status: 'verification_pending',
      },
    });

    if (!bankAccount) {
      return reply.status(404).send({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Bank account not found or not pending verification',
        },
      });
    }

    // Development mode
    if (!synctera.isConfigured() && process.env.NODE_ENV === 'development') {
      await prisma.bankAccount.update({
        where: { id: bankAccountId },
        data: {
          status: 'verified',
          verifiedAt: new Date(),
        },
      });

      return {
        success: true,
        data: { message: 'Bank account verified (development mode)' },
      };
    }

    if (!bankAccount.syncteraExternalAccountId) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Bank account missing verification reference',
        },
      });
    }

    try {
      await synctera.verifyMicroDeposits(bankAccount.syncteraExternalAccountId, amounts);

      await prisma.bankAccount.update({
        where: { id: bankAccountId },
        data: {
          status: 'verified',
          verifiedAt: new Date(),
        },
      });

      request.log.info({ bankAccountId }, 'Bank account verified via micro-deposits');

      return {
        success: true,
        data: { message: 'Bank account verified successfully' },
      };
    } catch (error) {
      if (error instanceof SyncteraError) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ERROR_CODES.VERIFICATION_FAILED,
            message: 'Micro-deposit amounts incorrect. Please try again.',
          },
        });
      }
      throw error;
    }
  });

  // ==================== MONEY MOVEMENT ====================

  /**
   * POST /bank/load
   * Load money from bank to wallet (ACH pull)
   */
  app.post<{ Body: LoadMoneyInput }>('/load', async (request, reply) => {
    const body = loadMoneySchema.parse(request.body);
    const { amount, idempotencyKey } = body;

    // Check if user has verified bank account
    const bankAccount = await prisma.bankAccount.findFirst({
      where: {
        userId: request.userId,
        status: 'verified',
      },
    });

    if (!bankAccount) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ERROR_CODES.BANK_NOT_LINKED,
          message: 'No verified bank account found. Please link a bank account first.',
        },
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: request.userId },
    });

    if (!user) {
      return reply.status(404).send({
        success: false,
        error: {
          code: ERROR_CODES.USER_NOT_FOUND,
          message: 'User not found',
        },
      });
    }

    // Check new account restrictions
    if (isNewAccount(user.createdAt, NEW_ACCOUNT.COOLING_PERIOD_DAYS)) {
      if (amount > NEW_ACCOUNT.FIRST_WEEK_MAX_LOAD) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
            message: `New accounts can only load up to ${NEW_ACCOUNT.FIRST_WEEK_MAX_LOAD} tokens in the first week`,
          },
        });
      }
    }

    // Check weekly load limit
    const weeklyKey = `rate:load:weekly:${request.userId}`;
    const weeklyCheck = await checkRateLimit(weeklyKey, RATE_LIMITS.LOAD_PER_WEEK, 604800);

    if (!weeklyCheck.allowed) {
      return reply.status(429).send({
        success: false,
        error: {
          code: ERROR_CODES.WEEKLY_LIMIT_EXCEEDED,
          message: 'Weekly load limit exceeded',
        },
      });
    }

    const key = idempotencyKey || generateIdempotencyKey();

    // Use bank account service to process the load
    const bankService = getBankAccountService();
    let loadResult;
    
    try {
      loadResult = await bankService.processLoad(bankAccount, user, amount, key, request);
    } catch (error) {
      if (error instanceof Error && error.message === 'TRANSFER_FAILED') {
        return reply.status(400).send({
          success: false,
          error: {
            code: ERROR_CODES.TRANSFER_FAILED,
            message: 'Failed to initiate bank transfer. Please try again.',
          },
        });
      }
      throw error;
    }

    const { externalTransactionId, transactionStatus, isInstant } = loadResult;

    // Create transaction record
    const transaction = await prisma.$transaction(async (tx) => {
      const existing = await tx.transaction.findUnique({
        where: { idempotencyKey: key },
      });

      if (existing) {
        return existing;
      }

      const newTx = await tx.transaction.create({
        data: {
          type: 'load',
          status: transactionStatus,
          toUserId: request.userId,
          amount,
          feeAmount: 0,
          idempotencyKey: key,
          externalId: externalTransactionId,
          completedAt: transactionStatus === 'completed' ? new Date() : null,
        },
      });

      if (transactionStatus === 'completed') {
        await tx.wallet.update({
          where: { userId: request.userId },
          data: {
            balance: { increment: amount },
            totalLoaded: { increment: amount },
          },
        });
      }

      return newTx;
    });

    request.log.info({ txId: transaction.id, amount }, 'Load initiated');

    const wallet = await prisma.wallet.findUnique({
      where: { userId: request.userId },
    });

    return reply.status(201).send({
      success: true,
      data: {
        transaction: {
          id: transaction.id,
          type: 'load',
          status: transaction.status,
          amount,
          createdAt: transaction.createdAt,
        },
        newBalance: Number(wallet?.balance || 0),
        message: isInstant
          ? 'Funds loaded instantly (test account)'
          : transaction.status === 'pending' 
            ? 'Load initiated. Funds will be available in 3-5 business days.'
            : 'Funds loaded successfully.',
      },
    });
  });

  /**
   * POST /bank/redeem
   * Redeem tokens to bank (ACH push)
   */
  app.post<{ Body: RedeemMoneyInput }>('/redeem', async (request, reply) => {
    const body = redeemMoneySchema.parse(request.body);
    const { amount, idempotencyKey } = body;

    const bankAccount = await prisma.bankAccount.findFirst({
      where: {
        userId: request.userId,
        status: 'verified',
      },
    });

    if (!bankAccount) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ERROR_CODES.BANK_NOT_LINKED,
          message: 'No verified bank account found. Please link a bank account first.',
        },
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: request.userId },
    });

    if (!user) {
      return reply.status(404).send({
        success: false,
        error: {
          code: ERROR_CODES.USER_NOT_FOUND,
          message: 'User not found',
        },
      });
    }

    // Check if this is a fake/test account
    const bankAccountWithMetadata = bankAccount as any;
    const isFakeAccount = bankAccountWithMetadata.metadata && 
      typeof bankAccountWithMetadata.metadata === 'object' && 
      'isFake' in bankAccountWithMetadata.metadata && 
      bankAccountWithMetadata.metadata.isFake === true;
    
    // Skip KYC and new account checks for fake accounts
    if (!isFakeAccount) {
      // Check KYC status FIRST - must be verified to redeem
      if (user.kycStatus !== 'verified') {
        request.log.warn({ 
          userId: request.userId, 
          kycStatus: user.kycStatus,
          isFakeAccount: false,
        }, 'User not KYC verified for redemption');
        return reply.status(403).send({
          success: false,
          error: {
            code: ERROR_CODES.KYC_REQUIRED,
            message: 'KYC verification is required to redeem funds.',
            details: {
              kycStatus: user.kycStatus || 'unverified',
              requiresKYC: true,
            },
          },
        });
      }

      // Check new account redemption restriction (only after KYC check passes)
      if (isNewAccount(user.createdAt, NEW_ACCOUNT.NO_REDEEM_DAYS)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
            message: `New accounts cannot redeem for ${NEW_ACCOUNT.NO_REDEEM_DAYS} days`,
          },
        });
      }
    } else {
      request.log.info({ 
        userId: request.userId,
        bankAccountId: bankAccount.id,
      }, 'Skipping KYC and 14-day restriction for fake account');
    }

    // Calculate fee
    const weeklyRedemptions = await prisma.transaction.aggregate({
      where: {
        fromUserId: request.userId,
        type: 'redemption',
        status: { in: ['completed', 'processing', 'pending'] },
        createdAt: { gte: getWeekStart() },
      },
      _sum: { amount: true },
    });

    const weeklyTotal = Number(weeklyRedemptions._sum.amount || 0);
    const remainingFree = Math.max(0, FREE_REDEMPTION_LIMIT - weeklyTotal);
    const feeAmount = amount > remainingFree ? OVER_LIMIT_REDEMPTION_FEE_CENTS / 100 : 0;

    // Check balance
    const wallet = await prisma.wallet.findUnique({
      where: { userId: request.userId },
    });

    if (!wallet || Number(wallet.balance) < amount + feeAmount) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ERROR_CODES.INSUFFICIENT_BALANCE,
          message: 'Insufficient balance',
        },
      });
    }

    const key = idempotencyKey || generateIdempotencyKey();

    // Use bank account service to process the redeem
    const bankService = getBankAccountService();
    let redeemResult;
    
    try {
      redeemResult = await bankService.processRedeem(bankAccount, user, amount, key, request);
    } catch (error) {
      if (error instanceof Error && error.message === 'TRANSFER_FAILED') {
        return reply.status(400).send({
          success: false,
          error: {
            code: ERROR_CODES.TRANSFER_FAILED,
            message: 'Failed to initiate bank transfer. Please try again.',
          },
        });
      }
      throw error;
    }

    const { externalTransactionId, transactionStatus, isInstant } = redeemResult;

    const transaction = await prisma.$transaction(async (tx) => {
      const existing = await tx.transaction.findUnique({
        where: { idempotencyKey: key },
      });

      if (existing) {
        return existing;
      }

      const newTx = await tx.transaction.create({
        data: {
          type: 'redemption',
          status: transactionStatus,
          fromUserId: request.userId,
          amount,
          feeAmount,
          idempotencyKey: key,
          externalId: externalTransactionId,
          completedAt: transactionStatus === 'completed' ? new Date() : null,
        },
      });

      await tx.wallet.update({
        where: { userId: request.userId },
        data: {
          balance: { decrement: amount + feeAmount },
          totalRedeemed: { increment: amount },
        },
      });

      if (feeAmount > 0) {
        await tx.transaction.create({
          data: {
            type: 'fee',
            status: 'completed',
            fromUserId: request.userId,
            amount: feeAmount,
            feeAmount: 0,
            metadata: { reason: 'redemption_over_limit', parentTxId: newTx.id },
            completedAt: new Date(),
          },
        });
      }

      return newTx;
    });

    request.log.info({ txId: transaction.id, amount, fee: feeAmount }, 'Redemption initiated');

    const updatedWallet = await prisma.wallet.findUnique({
      where: { userId: request.userId },
    });

    return reply.status(201).send({
      success: true,
      data: {
        transaction: {
          id: transaction.id,
          type: 'redemption',
          status: transaction.status,
          amount,
          feeAmount,
          createdAt: transaction.createdAt,
        },
        newBalance: Number(updatedWallet?.balance || 0),
        message: isInstant
          ? 'Redemption completed instantly (test account)'
          : transaction.status === 'pending'
            ? 'Redemption initiated. Funds will arrive in 1-3 business days.'
            : 'Redemption completed.',
      },
    });
  });

  /**
   * DELETE /bank/accounts/:id
   * Remove a linked bank account
   */
  app.delete<{ Params: { id: string } }>('/accounts/:id', async (request, reply) => {
    const { id } = request.params;

    const account = await prisma.bankAccount.findFirst({
      where: {
        id,
        userId: request.userId,
      },
    });

    if (!account) {
      return reply.status(404).send({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Bank account not found',
        },
      });
    }

    // Remove from Plaid if linked
    if (account.plaidAccessToken && plaid.isConfigured()) {
      await plaid.removeItem(account.plaidAccessToken);
    }

    await prisma.bankAccount.update({
      where: { id },
      data: {
        status: 'removed',
        removedAt: new Date(),
      },
    });

    return {
      success: true,
      data: { message: 'Bank account removed' },
    };
  });
};

// Helper to get start of current week
function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(now.setDate(diff));
  start.setHours(0, 0, 0, 0);
  return start;
}
