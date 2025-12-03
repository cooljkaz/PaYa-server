/**
 * KYC (Know Your Customer) Routes
 * 
 * Handles KYC verification through Synctera
 * Users must complete KYC before redeeming money
 */

import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { synctera, SyncteraError } from '../lib/synctera.js';
import { ERROR_CODES } from '@paya/shared';
import { z } from 'zod';

// KYC submission schema
const kycSubmissionSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  addressLine1: z.string().min(1).max(255),
  city: z.string().min(1).max(100),
  state: z.string().length(2, 'State must be 2-letter code'),
  postalCode: z.string().min(5).max(20),
  countryCode: z.string().length(2, 'Country code must be 2-letter ISO code').default('US'),
  ssnLast4: z.string().length(4, 'SSN last 4 must be 4 digits').regex(/^\d{4}$/),
  customerConsent: z.boolean().default(true),
});

type KYCSubmissionInput = z.infer<typeof kycSubmissionSchema>;

export const kycRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preValidation', app.authenticate);

  /**
   * GET /kyc/status
   * Get user's KYC status
   */
  app.get('/status', async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      select: {
        kycStatus: true,
        syncteraCustomerId: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    if (!user) {
      return {
        success: false,
        error: {
          code: ERROR_CODES.USER_NOT_FOUND,
          message: 'User not found',
        },
      };
    }

    // If we have a Synctera customer ID, fetch latest status from Synctera
    let syncteraStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | null = null;
    if (user.syncteraCustomerId && synctera.isConfigured()) {
      try {
        const customer = await synctera.getCustomer(user.syncteraCustomerId);
        syncteraStatus = customer.verification_status || null;
      } catch (error) {
        request.log.warn({ error, customerId: user.syncteraCustomerId }, 'Failed to fetch Synctera customer status');
      }
    }

    return {
      success: true,
      data: {
        kycStatus: syncteraStatus || user.kycStatus || 'unverified',
        hasSyncteraCustomer: !!user.syncteraCustomerId,
        hasBasicInfo: !!(user.firstName && user.lastName && user.email),
      },
    };
  });

  /**
   * POST /kyc/submit
   * Submit KYC information and trigger verification
   */
  app.post<{ Body: KYCSubmissionInput }>('/submit', async (request, reply) => {
    const body = kycSubmissionSchema.parse(request.body);

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

    if (!synctera.isConfigured()) {
      return reply.status(503).send({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'KYC verification is not available at this time',
        },
      });
    }

    try {
      // Get or create Synctera customer
      let syncteraCustomerId = user.syncteraCustomerId;
      
      if (!syncteraCustomerId) {
        // Get phone number - we don't store full phone, only hash
        // Use phoneLastFour as fallback, but ideally get from auth session
        // For now, construct a placeholder (Synctera may accept partial numbers in test mode)
        const fullPhoneNumber = `+1${user.phoneLastFour || '0000'}000000`; // Placeholder - in production, get from auth
        
        // Create customer in Synctera
        const customer = await synctera.createCustomer({
          first_name: body.firstName,
          last_name: body.lastName,
          email: body.email,
          phone_number: fullPhoneNumber,
          dob: body.dateOfBirth,
          ssn_last_4: body.ssnLast4,
          address: {
            address_line_1: body.addressLine1,
            city: body.city,
            state: body.state,
            postal_code: body.postalCode,
            country_code: body.countryCode,
          },
        });
        
        syncteraCustomerId = customer.id;
        
        // Update user with Synctera customer ID
        await prisma.user.update({
          where: { id: request.userId },
          data: { syncteraCustomerId },
        });
      } else {
        // Update existing customer
        await synctera.updateCustomer(syncteraCustomerId, {
          first_name: body.firstName,
          last_name: body.lastName,
          email: body.email,
          dob: body.dateOfBirth,
          ssn_last_4: body.ssnLast4,
          address: {
            address_line_1: body.addressLine1,
            city: body.city,
            state: body.state,
            postal_code: body.postalCode,
            country_code: body.countryCode,
          },
        });
      }

      // Store KYC data locally (optional, for convenience)
      await prisma.user.update({
        where: { id: request.userId },
        data: {
          firstName: body.firstName,
          lastName: body.lastName,
          email: body.email,
          dateOfBirth: new Date(body.dateOfBirth),
          addressLine1: body.addressLine1,
          city: body.city,
          state: body.state,
          postalCode: body.postalCode,
          countryCode: body.countryCode,
          kycStatus: 'pending',
        },
      });

      // Trigger KYC verification
      const clientIp = request.ip || request.headers['x-forwarded-for'] || '0.0.0.0';
      const verification = await synctera.verifyCustomerIdentity({
        person_id: syncteraCustomerId,
        customer_consent: body.customerConsent,
        customer_ip_address: Array.isArray(clientIp) ? clientIp[0] : clientIp,
      });

      // Update KYC status based on verification result
      const kycStatus = verification.verification_status === 'ACCEPTED' 
        ? 'verified' 
        : verification.verification_status === 'REJECTED'
          ? 'rejected'
          : 'pending';

      await prisma.user.update({
        where: { id: request.userId },
        data: { kycStatus },
      });

      request.log.info({ 
        userId: request.userId, 
        verificationId: verification.id,
        status: verification.verification_status,
      }, 'KYC verification submitted');

      return reply.status(201).send({
        success: true,
        data: {
          verificationId: verification.id,
          status: kycStatus,
          verificationStatus: verification.verification_status,
          message: verification.verification_status === 'ACCEPTED'
            ? 'Identity verified successfully!'
            : verification.verification_status === 'REJECTED'
              ? 'Identity verification was rejected. Please check your information and try again.'
              : 'Identity verification is pending. We will notify you once it\'s complete.',
        },
      });
    } catch (error) {
      request.log.error({ error, userId: request.userId }, 'KYC submission failed');
      
      if (error instanceof SyncteraError) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: error.message || 'Failed to submit KYC information',
          },
        });
      }
      
      return reply.status(500).send({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to submit KYC information',
        },
      });
    }
  });

  /**
   * GET /kyc/data
   * Get user's KYC data (from local DB or Synctera)
   */
  app.get('/data', async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        dateOfBirth: true,
        addressLine1: true,
        city: true,
        state: true,
        postalCode: true,
        countryCode: true,
        syncteraCustomerId: true,
      },
    });

    if (!user) {
      return {
        success: false,
        error: {
          code: ERROR_CODES.USER_NOT_FOUND,
          message: 'User not found',
        },
      };
    }

    // If we have Synctera customer ID, try to fetch from Synctera first (source of truth)
    if (user.syncteraCustomerId && synctera.isConfigured()) {
      try {
        const customer = await synctera.getCustomer(user.syncteraCustomerId);
        
        // Return Synctera data (more complete)
        return {
          success: true,
          data: {
            firstName: customer.first_name,
            lastName: customer.last_name,
            email: customer.email,
            dateOfBirth: customer.dob,
            address: customer.address,
            // Don't return SSN - we don't store it
          },
        };
      } catch (error) {
        request.log.warn({ error }, 'Failed to fetch from Synctera, using local data');
      }
    }

    // Fall back to local data
    return {
      success: true,
      data: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        dateOfBirth: user.dateOfBirth?.toISOString().split('T')[0],
        addressLine1: user.addressLine1,
        city: user.city,
        state: user.state,
        postalCode: user.postalCode,
        countryCode: user.countryCode,
      },
    };
  });
};

