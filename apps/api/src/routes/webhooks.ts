import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { synctera } from '../lib/synctera.js';
import crypto from 'crypto';

/**
 * Webhook handlers for external services
 */
export const webhookRoutes: FastifyPluginAsync = async (app) => {
  /**
   * POST /webhooks/synctera
   * Handle Synctera webhook events (ACH status updates, KYC results, etc.)
   */
  app.post('/synctera', {
    config: {
      // Disable body parsing to get raw body for signature verification
      rawBody: true,
    },
  }, async (request, reply) => {
    const signature = request.headers['x-synctera-signature'] as string;
    const webhookSecret = process.env.SYNCTERA_WEBHOOK_SECRET;

    // Verify webhook signature in production
    if (process.env.NODE_ENV === 'production' && webhookSecret) {
      const rawBody = (request as any).rawBody;
      if (!rawBody || !signature) {
        request.log.warn('Missing webhook signature or body');
        return reply.status(401).send({ error: 'Invalid signature' });
      }

      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      if (signature !== expectedSignature) {
        request.log.warn('Invalid webhook signature');
        return reply.status(401).send({ error: 'Invalid signature' });
      }
    }

    const event = request.body as SyncteraWebhookEvent;

    request.log.info({ eventType: event.event_type, resourceId: event.resource_id }, 'Synctera webhook received');

    try {
      switch (event.event_type) {
        case 'ACH.COMPLETED':
          await handleACHCompleted(event);
          break;

        case 'ACH.FAILED':
          await handleACHFailed(event);
          break;

        case 'ACH.RETURNED':
          await handleACHReturned(event);
          break;

        case 'EXTERNAL_ACCOUNT.VERIFIED':
          await handleExternalAccountVerified(event);
          break;

        case 'CUSTOMER.VERIFIED':
          await handleCustomerVerified(event);
          break;

        case 'CUSTOMER.REJECTED':
          await handleCustomerRejected(event);
          break;

        default:
          request.log.info({ eventType: event.event_type }, 'Unhandled webhook event type');
      }

      return { received: true };
    } catch (error) {
      request.log.error({ error, eventType: event.event_type }, 'Error processing webhook');
      // Return 200 to prevent retries for processing errors
      // Log the error for investigation
      return { received: true, error: 'Processing error logged' };
    }
  });
};

// Webhook event types
interface SyncteraWebhookEvent {
  event_type: string;
  resource_id: string;
  resource_type: string;
  created_time: string;
  data?: Record<string, any>;
}

/**
 * Handle ACH transfer completed
 */
async function handleACHCompleted(event: SyncteraWebhookEvent) {
  const achId = event.resource_id;

  // Find the transaction by external ID
  const transaction = await prisma.transaction.findFirst({
    where: { externalId: achId },
  });

  if (!transaction) {
    console.log(`No transaction found for ACH ID: ${achId}`);
    return;
  }

  if (transaction.status === 'completed') {
    console.log(`Transaction ${transaction.id} already completed`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Update transaction status
    await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'completed',
        externalStatus: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // Credit wallet for load transactions
    if (transaction.type === 'load' && transaction.toUserId) {
      await tx.wallet.update({
        where: { userId: transaction.toUserId },
        data: {
          balance: { increment: Number(transaction.amount) },
          totalLoaded: { increment: Number(transaction.amount) },
        },
      });
    }
  });

  console.log(`ACH completed for transaction ${transaction.id}`);
}

/**
 * Handle ACH transfer failed
 */
async function handleACHFailed(event: SyncteraWebhookEvent) {
  const achId = event.resource_id;

  const transaction = await prisma.transaction.findFirst({
    where: { externalId: achId },
  });

  if (!transaction) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'failed',
        externalStatus: 'FAILED',
        metadata: {
          ...(transaction.metadata as object || {}),
          failureReason: event.data?.reason || 'Unknown',
        },
      },
    });

    // Refund wallet for failed redemptions
    if (transaction.type === 'redemption' && transaction.fromUserId) {
      const refundAmount = Number(transaction.amount) + Number(transaction.feeAmount);
      await tx.wallet.update({
        where: { userId: transaction.fromUserId },
        data: {
          balance: { increment: refundAmount },
          totalRedeemed: { decrement: Number(transaction.amount) },
        },
      });
    }
  });

  console.log(`ACH failed for transaction ${transaction.id}`);
}

/**
 * Handle ACH returned (e.g., NSF)
 */
async function handleACHReturned(event: SyncteraWebhookEvent) {
  const achId = event.resource_id;

  const transaction = await prisma.transaction.findFirst({
    where: { externalId: achId },
  });

  if (!transaction) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'failed',
        externalStatus: 'RETURNED',
        metadata: {
          ...(transaction.metadata as object || {}),
          returnCode: event.data?.return_code,
          returnReason: event.data?.return_reason,
        },
      },
    });

    // Reverse the load if it was already credited
    if (transaction.type === 'load' && transaction.toUserId && transaction.status === 'completed') {
      await tx.wallet.update({
        where: { userId: transaction.toUserId },
        data: {
          balance: { decrement: Number(transaction.amount) },
          totalLoaded: { decrement: Number(transaction.amount) },
        },
      });

      // Create a reversal transaction
      await tx.transaction.create({
        data: {
          type: 'adjustment',
          status: 'completed',
          fromUserId: transaction.toUserId,
          amount: Number(transaction.amount),
          feeAmount: 0,
          memo: `ACH return reversal - ${event.data?.return_code || 'R01'}`,
          metadata: { originalTxId: transaction.id },
          completedAt: new Date(),
        },
      });
    }

    // Refund failed redemptions
    if (transaction.type === 'redemption' && transaction.fromUserId) {
      const refundAmount = Number(transaction.amount) + Number(transaction.feeAmount);
      await tx.wallet.update({
        where: { userId: transaction.fromUserId },
        data: {
          balance: { increment: refundAmount },
          totalRedeemed: { decrement: Number(transaction.amount) },
        },
      });
    }
  });

  console.log(`ACH returned for transaction ${transaction.id}`);
}

/**
 * Handle external bank account verified
 */
async function handleExternalAccountVerified(event: SyncteraWebhookEvent) {
  const externalAccountId = event.resource_id;

  await prisma.bankAccount.updateMany({
    where: { syncteraExternalAccountId: externalAccountId },
    data: {
      status: 'verified',
      verifiedAt: new Date(),
    },
  });

  console.log(`External account verified: ${externalAccountId}`);
}

/**
 * Handle customer KYC verified
 */
async function handleCustomerVerified(event: SyncteraWebhookEvent) {
  const customerId = event.resource_id;

  await prisma.user.updateMany({
    where: { syncteraCustomerId: customerId },
    data: { kycStatus: 'verified' },
  });

  console.log(`Customer KYC verified: ${customerId}`);
}

/**
 * Handle customer KYC rejected
 */
async function handleCustomerRejected(event: SyncteraWebhookEvent) {
  const customerId = event.resource_id;

  await prisma.user.updateMany({
    where: { syncteraCustomerId: customerId },
    data: { kycStatus: 'rejected' },
  });

  console.log(`Customer KYC rejected: ${customerId}`);
}

