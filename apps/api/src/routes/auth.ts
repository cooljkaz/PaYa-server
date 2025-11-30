import { FastifyPluginAsync } from 'fastify';
import { 
  requestOtpSchema, 
  verifyOtpSchema, 
  registerSchema,
  type RequestOtpInput,
  type VerifyOtpInput,
  type RegisterInput,
} from '@paya/shared';
import { prisma } from '../lib/prisma.js';
import { storeOtp, verifyOtp } from '../lib/redis.js';
import { SESSION, ERROR_CODES } from '@paya/shared';
import { generateOtp, hashPhone } from '../lib/utils.js';
import { sendSmsOtp } from '../services/sms.js';
import crypto from 'crypto';

export const authRoutes: FastifyPluginAsync = async (app) => {
  /**
   * POST /auth/request-otp
   * Request a one-time password sent via SMS
   */
  app.post<{ Body: RequestOtpInput }>('/request-otp', async (request, reply) => {
    const body = requestOtpSchema.parse(request.body);
    const { phone } = body;

    // Generate 6-digit OTP
    const otp = generateOtp();

    // Store OTP in Redis with expiry
    await storeOtp(phone, otp, SESSION.OTP_EXPIRY_SECONDS);

    // Send SMS (in development, just log it)
    if (process.env.NODE_ENV === 'development') {
      request.log.info({ phone, otp }, 'OTP generated (dev mode)');
    } else {
      await sendSmsOtp(phone, otp);
    }

    return reply.status(200).send({
      success: true,
      data: {
        message: 'OTP sent',
        expiresIn: SESSION.OTP_EXPIRY_SECONDS,
      },
    });
  });

  /**
   * POST /auth/verify-otp
   * Verify OTP and login existing user
   */
  app.post<{ Body: VerifyOtpInput }>('/verify-otp', async (request, reply) => {
    const body = verifyOtpSchema.parse(request.body);
    const { phone, otp, deviceId, deviceName, devicePlatform } = body;

    // Verify OTP
    const isValid = await verifyOtp(phone, otp);
    if (!isValid) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ERROR_CODES.INVALID_OTP,
          message: 'Invalid or expired OTP',
        },
      });
    }

    // Find existing user
    const phoneHash = hashPhone(phone);
    const user = await prisma.user.findUnique({
      where: { phoneHash },
      include: { wallet: true },
    });

    if (!user) {
      // Restore OTP so it can be used for registration
      // This is necessary because verifyOtp consumes the OTP
      await storeOtp(phone, otp, SESSION.OTP_EXPIRY_SECONDS);

      // User doesn't exist - they need to register
      return reply.status(404).send({
        success: false,
        error: {
          code: ERROR_CODES.USER_NOT_FOUND,
          message: 'User not found. Please register.',
        },
      });
    }

    // Check if account is frozen
    if (user.status === 'frozen' || user.status === 'suspended') {
      return reply.status(403).send({
        success: false,
        error: {
          code: ERROR_CODES.ACCOUNT_FROZEN,
          message: 'Account is suspended',
        },
      });
    }

    // Create session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionTokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    const expiresAt = new Date(Date.now() + SESSION.REFRESH_TOKEN_EXPIRY_SECONDS * 1000);

    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sessionTokenHash,
        deviceId,
        deviceName,
        devicePlatform,
        expiresAt,
      },
    });

    // Update last active
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

    // Generate JWT
    const accessToken = app.jwt.sign({ 
      userId: user.id,
      username: user.username,
    });

    return reply.status(200).send({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          phoneLastFour: user.phoneLastFour,
          status: user.status,
          createdAt: user.createdAt,
        },
        wallet: {
          balance: Number(user.wallet?.balance || 0),
        },
        accessToken,
        refreshToken: sessionToken,
        expiresIn: SESSION.ACCESS_TOKEN_EXPIRY_SECONDS,
      },
    });
  });

  /**
   * POST /auth/register
   * Register a new user after OTP verification
   */
  app.post<{ Body: RegisterInput }>('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const { phone, otp, username, deviceId, deviceName, devicePlatform } = body;

    // Verify OTP
    const isValid = await verifyOtp(phone, otp);
    if (!isValid) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ERROR_CODES.INVALID_OTP,
          message: 'Invalid or expired OTP',
        },
      });
    }

    // Check if username is taken
    const existingUsername = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });

    if (existingUsername) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ERROR_CODES.USERNAME_TAKEN,
          message: 'Username is already taken',
        },
      });
    }

    // Check if phone is already registered
    const phoneHash = hashPhone(phone);
    const existingPhone = await prisma.user.findUnique({
      where: { phoneHash },
    });

    if (existingPhone) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ERROR_CODES.INVALID_PHONE,
          message: 'Phone number is already registered',
        },
      });
    }

    // Create user with wallet and claim any pending payments in transaction
    const { user, claimedPayments } = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          username: username.toLowerCase(),
          phoneHash,
          phoneLastFour: phone.slice(-4),
          status: 'active',
          flags: ['new_account'],
        },
      });

      // Check for pending payments to this phone number
      const pendingPayments = await tx.pendingPayment.findMany({
        where: {
          toPhoneHash: phoneHash,
          status: 'pending',
          expiresAt: { gt: new Date() },
        },
        include: {
          fromUser: true,
        },
      });

      // Calculate total amount from pending payments
      const totalPendingAmount = pendingPayments.reduce(
        (sum, p) => sum + Number(p.amount),
        0
      );

      // Create wallet with claimed amount
      await tx.wallet.create({
        data: {
          userId: newUser.id,
          balance: totalPendingAmount,
          totalReceived: totalPendingAmount,
        },
      });

      // Mark all pending payments as claimed and create transactions
      for (const pending of pendingPayments) {
        // Update pending payment status
        await tx.pendingPayment.update({
          where: { id: pending.id },
          data: {
            status: 'claimed',
            claimedByUserId: newUser.id,
            claimedAt: new Date(),
          },
        });

        // Create a transaction record for the claimed payment
        await tx.transaction.create({
          data: {
            type: 'payment',
            status: 'completed',
            fromUserId: pending.fromUserId,
            toUserId: newUser.id,
            amount: pending.amount,
            feeAmount: 0,
            memo: pending.memo,
            isPublic: pending.isPublic,
            completedAt: new Date(),
            metadata: {
              claimedFromPendingPaymentId: pending.id,
            },
          },
        });

        // Update sender's totalSent
        await tx.wallet.update({
          where: { userId: pending.fromUserId },
          data: {
            totalSent: { increment: pending.amount },
          },
        });
      }

      return { 
        user: newUser, 
        claimedPayments: pendingPayments.map(p => ({
          id: p.id,
          amount: Number(p.amount),
          fromUsername: p.fromUser.username,
          memo: p.memo,
        })),
      };
    });

    // Create session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionTokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    const expiresAt = new Date(Date.now() + SESSION.REFRESH_TOKEN_EXPIRY_SECONDS * 1000);

    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sessionTokenHash,
        deviceId,
        deviceName,
        devicePlatform,
        expiresAt,
      },
    });

    // Generate JWT
    const accessToken = app.jwt.sign({ 
      userId: user.id,
      username: user.username,
    });

    // Calculate total claimed amount
    const totalClaimedAmount = claimedPayments.reduce((sum, p) => sum + p.amount, 0);

    request.log.info(
      { 
        userId: user.id, 
        username: user.username,
        claimedPayments: claimedPayments.length,
        claimedAmount: totalClaimedAmount,
      }, 
      'New user registered'
    );

    return reply.status(201).send({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          phoneLastFour: user.phoneLastFour,
          status: user.status,
          createdAt: user.createdAt,
        },
        wallet: {
          balance: totalClaimedAmount,
        },
        accessToken,
        refreshToken: sessionToken,
        expiresIn: SESSION.ACCESS_TOKEN_EXPIRY_SECONDS,
        // Include claimed payments info so the app can show a welcome message
        claimedPayments: claimedPayments.length > 0 ? {
          count: claimedPayments.length,
          totalAmount: totalClaimedAmount,
          payments: claimedPayments,
        } : null,
      },
    });
  });

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token
   */
  app.post<{ Body: { refreshToken: string } }>('/refresh', async (request, reply) => {
    const { refreshToken } = request.body;

    if (!refreshToken) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: 'Refresh token required',
        },
      });
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const session = await prisma.session.findFirst({
      where: {
        tokenHash,
        isActive: true,
        expiresAt: { gt: new Date() },
        revokedAt: null,
      },
      include: { user: true },
    });

    if (!session) {
      return reply.status(401).send({
        success: false,
        error: {
          code: ERROR_CODES.SESSION_EXPIRED,
          message: 'Invalid or expired session',
        },
      });
    }

    // Update last used
    await prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });

    // Generate new access token
    const accessToken = app.jwt.sign({ 
      userId: session.user.id,
      username: session.user.username,
    });

    return reply.status(200).send({
      success: true,
      data: {
        accessToken,
        expiresIn: SESSION.ACCESS_TOKEN_EXPIRY_SECONDS,
      },
    });
  });

  /**
   * POST /auth/logout
   * Revoke current session
   */
  app.post('/logout', { preValidation: [app.authenticate] }, async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken?: string };

    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await prisma.session.updateMany({
        where: { tokenHash },
        data: { isActive: false, revokedAt: new Date() },
      });
    }

    return reply.status(200).send({
      success: true,
      data: { message: 'Logged out' },
    });
  });
};

// Add authenticate decorator to Fastify
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    userId: string;
    username: string;
  }
}

import { FastifyRequest, FastifyReply } from 'fastify';

