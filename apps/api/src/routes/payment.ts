import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { checkRateLimit } from '../lib/redis.js';
import { 
  sendPaymentSchema, 
  type SendPaymentInput,
  ERROR_CODES,
  RATE_LIMITS,
  PHONE,
} from '@paya/shared';
import { generateIdempotencyKey, getWeekNumber, hashPhone } from '../lib/utils.js';
import { sendSms } from '../services/sms.js';
import { z } from 'zod';

// Schema for sending to phone number
const sendToPhoneSchema = z.object({
  toPhone: z.string().regex(/^\+1\d{10}$/, 'Phone must be in E.164 format (+1XXXXXXXXXX)'),
  amount: z.number().int().min(1).max(10000),
  memo: z.string().max(280).optional(),
  isPublic: z.boolean().default(true),
});

type SendToPhoneInput = z.infer<typeof sendToPhoneSchema>;

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

  /**
   * POST /payments/send-to-phone
   * Send tokens to a phone number (creates pending payment if user doesn't exist)
   */
  app.post<{ Body: SendToPhoneInput }>('/send-to-phone', async (request, reply) => {
    const body = sendToPhoneSchema.parse(request.body);
    const { toPhone, amount, memo, isPublic } = body;

    // Check rate limits (same as regular sends)
    const hourlyKey = `rate:sends:hourly:${request.userId}`;
    const hourlyCheck = await checkRateLimit(hourlyKey, RATE_LIMITS.SENDS_PER_HOUR, 3600);
    
    if (!hourlyCheck.allowed) {
      return reply.status(429).send({
        success: false,
        error: {
          code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
          message: 'Hourly send limit exceeded',
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
        },
      });
    }

    // Hash the phone number to check if user exists
    const phoneHash = hashPhone(toPhone);
    const phoneLastFour = toPhone.slice(-4);

    // Check if recipient already exists
    const existingUser = await prisma.user.findUnique({
      where: { phoneHash },
      include: { wallet: true },
    });

    if (existingUser) {
      // User exists! Redirect to normal send flow
      if (existingUser.id === request.userId) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ERROR_CODES.SELF_TRANSFER,
            message: 'Cannot send tokens to yourself',
          },
        });
      }

      // Do a regular transfer
      const key = generateIdempotencyKey();
      
      const result = await prisma.$transaction(async (tx) => {
        const senderWallet = await tx.wallet.findUnique({
          where: { userId: request.userId },
        });

        if (!senderWallet || Number(senderWallet.balance) < amount) {
          throw new Error('INSUFFICIENT_BALANCE');
        }

        const transaction = await tx.transaction.create({
          data: {
            type: 'payment',
            status: 'completed',
            fromUserId: request.userId,
            toUserId: existingUser.id,
            amount,
            feeAmount: 0,
            memo: memo || null,
            isPublic,
            idempotencyKey: key,
            completedAt: new Date(),
          },
        });

        await tx.wallet.update({
          where: { userId: request.userId },
          data: {
            balance: { decrement: amount },
            totalSent: { increment: amount },
          },
        });

        await tx.wallet.update({
          where: { userId: existingUser.id },
          data: {
            balance: { increment: amount },
            totalReceived: { increment: amount },
          },
        });

        return transaction;
      });

      const updatedWallet = await prisma.wallet.findUnique({
        where: { userId: request.userId },
      });

      return reply.status(201).send({
        success: true,
        data: {
          type: 'instant',
          transaction: {
            id: result.id,
            status: 'completed',
            amount,
            toUsername: existingUser.username,
          },
          newBalance: Number(updatedWallet?.balance || 0),
          message: `Sent $${amount} to @${existingUser.username}`,
        },
      });
    }

    // User doesn't exist - create pending payment
    const senderWallet = await prisma.wallet.findUnique({
      where: { userId: request.userId },
    });

    if (!senderWallet || Number(senderWallet.balance) < amount) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ERROR_CODES.INSUFFICIENT_BALANCE,
          message: 'Insufficient balance',
        },
      });
    }

    // Get sender info for the SMS
    const sender = await prisma.user.findUnique({
      where: { id: request.userId },
    });

    // Create pending payment and debit sender in a transaction
    const pendingPayment = await prisma.$transaction(async (tx) => {
      // Debit sender immediately (funds are held)
      await tx.wallet.update({
        where: { userId: request.userId },
        data: {
          balance: { decrement: amount },
        },
      });

      // Create pending payment (expires in 30 days)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      return tx.pendingPayment.create({
        data: {
          fromUserId: request.userId,
          toPhoneHash: phoneHash,
          toPhoneLastFour: phoneLastFour,
          amount,
          memo: memo || null,
          isPublic,
          expiresAt,
          inviteSentAt: new Date(),
          inviteCount: 1,
        },
      });
    });

    // Send SMS invite (async, don't wait)
    const smsMessage = `${sender?.username || 'Someone'} sent you $${amount} on PaYa! Download the app to claim your money: https://paya.cash/download`;
    
    sendSms(toPhone, smsMessage).catch((err) => {
      request.log.error({ err, phone: phoneLastFour }, 'Failed to send invite SMS');
    });

    const updatedWallet = await prisma.wallet.findUnique({
      where: { userId: request.userId },
    });

    request.log.info(
      { pendingId: pendingPayment.id, amount, toPhone: `***${phoneLastFour}` },
      'Pending payment created'
    );

    return reply.status(201).send({
      success: true,
      data: {
        type: 'pending',
        pendingPayment: {
          id: pendingPayment.id,
          status: 'pending',
          amount,
          toPhoneLastFour: phoneLastFour,
          expiresAt: pendingPayment.expiresAt,
        },
        newBalance: Number(updatedWallet?.balance || 0),
        message: `Sent $${amount} to ***-***-${phoneLastFour}. They'll receive an SMS to download PaYa and claim the money.`,
      },
    });
  });

  /**
   * GET /payments/pending
   * Get all pending payments sent by the user
   */
  app.get('/pending', async (request) => {
    const pendingPayments = await prisma.pendingPayment.findMany({
      where: {
        fromUserId: request.userId,
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: pendingPayments.map(p => ({
        id: p.id,
        amount: Number(p.amount),
        toPhoneLastFour: p.toPhoneLastFour,
        memo: p.memo,
        status: p.status,
        expiresAt: p.expiresAt,
        createdAt: p.createdAt,
      })),
    };
  });

  /**
   * POST /payments/pending/:id/cancel
   * Cancel a pending payment and refund the sender
   */
  app.post<{ Params: { id: string } }>('/pending/:id/cancel', async (request, reply) => {
    const { id } = request.params;

    const pendingPayment = await prisma.pendingPayment.findFirst({
      where: {
        id,
        fromUserId: request.userId,
        status: 'pending',
      },
    });

    if (!pendingPayment) {
      return reply.status(404).send({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Pending payment not found',
        },
      });
    }

    // Refund the sender
    await prisma.$transaction(async (tx) => {
      await tx.pendingPayment.update({
        where: { id },
        data: { status: 'refunded' },
      });

      await tx.wallet.update({
        where: { userId: request.userId },
        data: {
          balance: { increment: pendingPayment.amount },
        },
      });
    });

    const updatedWallet = await prisma.wallet.findUnique({
      where: { userId: request.userId },
    });

    return {
      success: true,
      data: {
        message: 'Payment cancelled and refunded',
        refundedAmount: Number(pendingPayment.amount),
        newBalance: Number(updatedWallet?.balance || 0),
      },
    };
  });
};

