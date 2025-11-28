import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { checkRateLimit } from '../lib/redis.js';
import { 
  sendPaymentSchema, 
  type SendPaymentInput,
  ERROR_CODES,
  RATE_LIMITS,
} from '@paya/shared';
import { generateIdempotencyKey, getWeekNumber } from '../lib/utils.js';

export const paymentRoutes: FastifyPluginAsync = async (app) => {
  // All routes require authentication
  app.addHook('preValidation', app.authenticate);

  /**
   * POST /payments/send
   * Send tokens to another user
   */
  app.post<{ Body: SendPaymentInput }>('/send', async (request, reply) => {
    const body = sendPaymentSchema.parse(request.body);
    const { toUsername, amount, memo, isPublic, idempotencyKey } = body;

    // Check rate limits
    const hourlyKey = `rate:sends:hourly:${request.userId}`;
    const hourlyCheck = await checkRateLimit(hourlyKey, RATE_LIMITS.SENDS_PER_HOUR, 3600);
    
    if (!hourlyCheck.allowed) {
      return reply.status(429).send({
        success: false,
        error: {
          code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
          message: 'Hourly send limit exceeded',
          details: { resetAt: new Date(hourlyCheck.resetAt).toISOString() },
        },
      });
    }

    const dailyKey = `rate:sends:daily:${request.userId}`;
    const dailyCheck = await checkRateLimit(dailyKey, RATE_LIMITS.SENDS_PER_DAY, 86400);
    
    if (!dailyCheck.allowed) {
      return reply.status(429).send({
        success: false,
        error: {
          code: ERROR_CODES.DAILY_LIMIT_EXCEEDED,
          message: 'Daily send limit exceeded',
          details: { resetAt: new Date(dailyCheck.resetAt).toISOString() },
        },
      });
    }

    // Find recipient
    const recipient = await prisma.user.findUnique({
      where: { username: toUsername.toLowerCase() },
      include: { wallet: true },
    });

    if (!recipient || recipient.status !== 'active') {
      return reply.status(404).send({
        success: false,
        error: {
          code: ERROR_CODES.USER_NOT_FOUND,
          message: 'Recipient not found',
        },
      });
    }

    // Can't send to self
    if (recipient.id === request.userId) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ERROR_CODES.SELF_TRANSFER,
          message: 'Cannot send tokens to yourself',
        },
      });
    }

    // Execute transfer in transaction
    const key = idempotencyKey || generateIdempotencyKey();

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Check idempotency
        const existing = await tx.transaction.findUnique({
          where: { idempotencyKey: key },
        });
        
        if (existing) {
          return { transaction: existing, duplicate: true };
        }

        // Lock sender wallet
        const senderWallet = await tx.wallet.findUnique({
          where: { userId: request.userId },
        });

        if (!senderWallet) {
          throw new Error('WALLET_NOT_FOUND');
        }

        // Check balance
        if (Number(senderWallet.balance) < amount) {
          throw new Error('INSUFFICIENT_BALANCE');
        }

        // Create transaction
        const transaction = await tx.transaction.create({
          data: {
            type: 'payment',
            status: 'completed',
            fromUserId: request.userId,
            toUserId: recipient.id,
            amount,
            feeAmount: 0,
            memo: memo || null,
            isPublic,
            idempotencyKey: key,
            completedAt: new Date(),
          },
        });

        // Debit sender
        await tx.wallet.update({
          where: { userId: request.userId },
          data: {
            balance: { decrement: amount },
            totalSent: { increment: amount },
          },
        });

        // Credit recipient
        await tx.wallet.update({
          where: { userId: recipient.id },
          data: {
            balance: { increment: amount },
            totalReceived: { increment: amount },
          },
        });

        // Create ledger entries
        const newSenderBalance = Number(senderWallet.balance) - amount;
        const recipientWallet = await tx.wallet.findUnique({
          where: { userId: recipient.id },
        });
        const newRecipientBalance = Number(recipientWallet!.balance);

        await tx.ledgerEntry.createMany({
          data: [
            {
              transactionId: transaction.id,
              walletId: senderWallet.id,
              entryType: 'debit',
              amount,
              balanceAfter: newSenderBalance,
            },
            {
              transactionId: transaction.id,
              walletId: recipientWallet!.id,
              entryType: 'credit',
              amount,
              balanceAfter: newRecipientBalance,
            },
          ],
        });

        // Update weekly activity for sender (if public payment)
        if (isPublic) {
          const weekNumber = getWeekNumber();
          await tx.weeklyActivity.upsert({
            where: {
              userId_weekNumber: {
                userId: request.userId,
                weekNumber,
              },
            },
            create: {
              userId: request.userId,
              weekNumber,
              publicPaymentsSent: 1,
            },
            update: {
              publicPaymentsSent: { increment: 1 },
            },
          });

          // Update for recipient too
          await tx.weeklyActivity.upsert({
            where: {
              userId_weekNumber: {
                userId: recipient.id,
                weekNumber,
              },
            },
            create: {
              userId: recipient.id,
              weekNumber,
              publicPaymentsReceived: 1,
            },
            update: {
              publicPaymentsReceived: { increment: 1 },
            },
          });
        }

        return { transaction, duplicate: false };
      });

      if (result.duplicate) {
        return reply.status(200).send({
          success: true,
          data: {
            id: result.transaction.id,
            message: 'Duplicate request - original transaction returned',
          },
        });
      }

      request.log.info(
        { txId: result.transaction.id, amount, to: toUsername },
        'Payment sent'
      );

      // Get updated balance
      const updatedWallet = await prisma.wallet.findUnique({
        where: { userId: request.userId },
      });

      return reply.status(201).send({
        success: true,
        data: {
          transaction: {
            id: result.transaction.id,
            type: 'payment',
            status: 'completed',
            amount,
            memo,
            isPublic,
            toUsername: recipient.username,
            createdAt: result.transaction.createdAt,
          },
          newBalance: Number(updatedWallet?.balance || 0),
        },
      });
    } catch (error) {
      const err = error as Error;
      
      if (err.message === 'INSUFFICIENT_BALANCE') {
        return reply.status(400).send({
          success: false,
          error: {
            code: ERROR_CODES.INSUFFICIENT_BALANCE,
            message: 'Insufficient balance',
          },
        });
      }

      throw error;
    }
  });
};

