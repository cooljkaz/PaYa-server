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
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        request.log.warn({ url: request.url }, 'Missing or invalid Authorization header');
        return reply.status(401).send({
          success: false,
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: 'Missing or invalid authorization token',
          },
        });
      }

      const token = authHeader.substring(7); // Remove "Bearer " prefix
      const decoded = await request.jwtVerify<{
        userId: string;
        username: string;
      }>();
      
      request.userId = decoded.userId;
      request.username = decoded.username;
      request.log.info({ 
        userId: decoded.userId, 
        username: decoded.username,
        tokenPrefix: token.substring(0, 20) + '...',
      }, 'Token verified successfully');
    } catch (err: any) {
      request.log.warn({ 
        url: request.url,
        error: err.message,
        errorName: err.name,
        hasJwtSecret: !!process.env.JWT_ACCESS_SECRET,
      }, 'JWT verification failed');
      
      return reply.status(401).send({
        success: false,
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: err.message || 'Invalid or expired token',
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

