# PaYa

**A P2P User-Owned Payment Network**

---

## 🎯 Vision

PaYa is a transparent, user-owned payment network where:
- Every dollar is backed 1:1 by real reserves
- Users share in the network's success through weekly rewards
- The system is radically transparent — reserve balances, revenue, and distributions are public

## 📋 Documentation

| Document | Description |
|----------|-------------|
| [Technical Architecture](docs/TECHNICAL_ARCHITECTURE.md) | Cloud platform, banking connectors, security, redundancy |
| [Database Schema](docs/DATABASE_SCHEMA.md) | PostgreSQL schema with double-entry accounting |
| [Decision Matrix](docs/DECISION_MATRIX.md) | Quick reference for all technical decisions |
| [Mobile API Reference](docs/MOBILE_API_REFERENCE.md) | Complete API docs for mobile development |

## 🏗️ MVP Features

1. **Account Creation** — Phone verification, unique @username
2. **Wallet** — Integer tokens (1 token = $1)
3. **Load Money** — Bank → Tokens via ACH
4. **Send Tokens** — Instant P2P transfers
5. **Public Feed** — Real-time payment activity
6. **Weekly Rewards** — Equal share of revenue for active users
7. **Redeem** — Tokens → Bank via ACH
8. **Transparency Dashboard** — Public reserve and reward data

## 🛠️ Tech Stack

```
Frontend:     React Native (Expo) + TypeScript  [future]
Backend:      Node.js + Fastify + Prisma
Database:     PostgreSQL + Redis
Cloud:        AWS (ECS, RDS, ElastiCache)       [production]
Banking:      Plaid (linking) + Dwolla (ACH)    [integration pending]
Auth:         SMS OTP via Twilio                [integration pending]
```

## 📁 Project Structure

```
PaYa/
├── docs/                       # Technical documentation
├── apps/
│   ├── api/                    # Backend API (Fastify + Prisma)
│   │   ├── src/
│   │   │   ├── routes/         # API endpoints
│   │   │   ├── services/       # Business logic
│   │   │   ├── lib/            # Utilities
│   │   │   └── middleware/     # Auth, validation
│   │   └── prisma/             # Database schema
│   └── mobile/                 # React Native app [future]
├── packages/
│   └── shared/                 # Shared types, constants, validation
├── docker-compose.yml          # Local dev stack
└── package.json                # Monorepo config
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20+
- **pnpm** 9+ (`npm install -g pnpm`)
- **Docker** (for PostgreSQL and Redis)

### Quick Start

```bash
# 1. Clone and install dependencies
cd PaYa
pnpm install

# 2. Start the database and Redis
docker compose up -d

# 3. Set up environment variables
cp apps/api/env.example apps/api/.env
# Edit .env with your settings (defaults work for local dev)

# 4. Initialize the database
pnpm db:generate    # Generate Prisma client
pnpm db:push        # Create database tables
pnpm db:seed        # Seed with test data (optional)

# 5. Start the API server
pnpm dev
```

The API will be running at **http://localhost:3000**

### Verify It's Working

```bash
# Health check
curl http://localhost:3000/health

# Detailed health check (includes DB and Redis status)
curl http://localhost:3000/health/detailed

# Get transparency data (public endpoint)
curl http://localhost:3000/transparency
```

### Test Authentication Flow (Development Mode)

In development mode, OTP codes are logged to the console instead of sent via SMS:

```bash
# 1. Request OTP
curl -X POST http://localhost:3000/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+11234567890"}'

# Check the server logs for the OTP code

# 2. Register new user
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+11234567890",
    "otp": "123456",
    "username": "myusername"
  }'

# 3. Login existing user
curl -X POST http://localhost:3000/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+11234567890",
    "otp": "123456"
  }'
```

### Available Scripts

```bash
# Development
pnpm dev              # Start API in dev mode with hot reload
pnpm build            # Build all packages
pnpm lint             # Lint all packages
pnpm test             # Run tests

# Database
pnpm db:generate      # Generate Prisma client
pnpm db:migrate       # Run migrations
pnpm db:push          # Push schema to DB (dev only)
pnpm db:studio        # Open Prisma Studio GUI
pnpm db:seed          # Seed database with test data

# Docker
docker compose up -d              # Start PostgreSQL + Redis
docker compose --profile debug up -d  # Include pgAdmin + Redis Commander
docker compose down               # Stop all services
```

### Database GUI Tools

With the `debug` profile:
- **pgAdmin**: http://localhost:5050 (admin@paya.local / admin)
- **Redis Commander**: http://localhost:8081

## 🔌 API Endpoints

### Public (No Auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Basic health check |
| GET | `/health/detailed` | Health with DB/Redis status |
| GET | `/feed` | Public payment feed |
| WS | `/feed/live` | Real-time feed WebSocket |
| GET | `/transparency` | Public dashboard data |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/request-otp` | Request SMS OTP |
| POST | `/auth/verify-otp` | Login with OTP |
| POST | `/auth/register` | Create account with OTP |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Revoke session |

### User (Auth Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users/me` | Get current user profile |
| GET | `/users/:username` | Get public profile |
| GET | `/users/search?q=` | Search users |

### Wallet (Auth Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/wallet` | Get balance and stats |
| GET | `/wallet/transactions` | Transaction history |
| GET | `/wallet/transactions/:id` | Single transaction |

### Payments (Auth Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/payments/send` | Send tokens to user |

### Banking (Auth Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/bank/accounts` | List linked accounts |
| POST | `/bank/link/create-token` | Get Plaid Link token |
| POST | `/bank/link/exchange` | Exchange Plaid token |
| POST | `/bank/load` | Load money from bank |
| POST | `/bank/redeem` | Redeem tokens to bank |
| DELETE | `/bank/accounts/:id` | Remove bank account |

### Admin (Auth + Admin Role)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/users` | List all users |
| POST | `/admin/users/:id/freeze` | Freeze account |
| POST | `/admin/users/:id/unfreeze` | Unfreeze account |
| POST | `/admin/users/:id/flag` | Add user flag |
| GET | `/admin/transactions` | List transactions |
| GET | `/admin/audit-logs` | View audit logs |
| POST | `/admin/reserve/snapshot` | Create reserve snapshot |

## 🧪 Development Notes

### Test Users (After Seeding)

| Username | Phone | Balance |
|----------|-------|---------|
| alice | +11234567890 | 1000 tokens |
| bob | +10987654321 | 500 tokens |
| charlie | +11111111111 | 250 tokens |
| diana | +12222222222 | 100 tokens |

### Rate Limits (Development)

- 100 API requests/minute
- 10 sends/hour
- 50 sends/day
- 2000 tokens load/week

### Banking Integration

Currently using mock implementations:
- **Plaid**: Returns mock tokens in development
- **Dwolla**: Auto-completes transfers in development

To integrate real services, add credentials to `.env` and the code will use live APIs.

## 📊 Next Steps

- [ ] Integrate Twilio for real SMS OTP
- [ ] Integrate Plaid for bank account linking
- [ ] Integrate Dwolla for ACH transfers
- [ ] Implement weekly reward distribution job
- [ ] Add comprehensive test suite
- [ ] Deploy to AWS
- [ ] Build React Native mobile app

---

*Version: MVP v1 Development*
