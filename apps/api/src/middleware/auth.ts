import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ERROR_CODES } from '@paya/shared';

/**
 * Authentication middleware decorator
 * Verifies JWT token and sets userId/username on request
 */
export async function registerAuthMiddleware(app: FastifyInstance) {
  app.decorate('authenticate', async function (
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    try {
      const decoded = await request.jwtVerify<{
        userId: string;
        username: string;
      }>();
      
      request.userId = decoded.userId;
      request.username = decoded.username;
    } catch (err) {
      return reply.status(401).send({
        success: false,
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: 'Invalid or expired token',
        },
      });
    }
  });
}

// Augment Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    userId: string;
    username: string;
  }
}

