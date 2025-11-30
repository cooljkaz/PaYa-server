# Multi-stage build for PaYa API Server
FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm@8.15.5

# Install dependencies stage
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build stage
FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy source code
COPY . .
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Generate Prisma Client
RUN cd apps/api && pnpm db:generate

# Build TypeScript
RUN pnpm build

# Production stage
FROM base AS runner
WORKDIR /app

# Install OpenSSL for Prisma (required for database connections)
RUN apk add --no-cache openssl

ENV NODE_ENV=production

# Copy built files
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/public ./apps/api/public
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules

# Generate Prisma Client for production
RUN cd apps/api && pnpm db:generate

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["node", "dist/index.js"]

