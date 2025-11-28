# PaYa Technical Architecture Plan
## P2P User-Owned Payment Network — MVP v1

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Cloud Platform Selection](#cloud-platform-selection)
3. [Banking Connectors & Money Movement](#banking-connectors--money-movement)
4. [Real-Time Data & Analytics](#real-time-data--analytics)
5. [Security Architecture](#security-architecture)
6. [Redundancy & High Availability](#redundancy--high-availability)
7. [Technology Stack Recommendation](#technology-stack-recommendation)
8. [Infrastructure Diagram](#infrastructure-diagram)
9. [Cost Estimation](#cost-estimation)
10. [Implementation Phases](#implementation-phases)

---

## Executive Summary

This document outlines the technical architecture for PaYa's MVP — a P2P payment network where users can load funds, transfer tokens, view a public feed, and receive weekly rewards from a shared revenue pool.

**Key Technical Goals:**
- Full-reserve 1:1 token-to-USD backing at all times
- Sub-second P2P transfers with real-time feed updates
- Bank account linking and ACH transfers (load/redeem)
- Automated weekly reward distribution
- Transparent public dashboard
- Scalable from 100 to 100,000+ users without re-architecture

---

## Cloud Platform Selection

### Recommendation: **AWS (Amazon Web Services)**

| Platform | Pros | Cons |
|----------|------|------|
| **AWS** | Most mature fintech ecosystem, extensive compliance certs (SOC2, PCI-DSS, HIPAA), best startup credits ($100K via AWS Activate), largest partner ecosystem | Steeper learning curve, can get expensive without careful management |
| **GCP** | Excellent data analytics/ML, competitive pricing, good Kubernetes support | Smaller fintech partner ecosystem, fewer compliance templates |
| **Azure** | Strong enterprise integration, good hybrid cloud | Less startup-friendly, complex pricing |

### Why AWS Wins for Fintech MVP:

1. **AWS Activate Program** — Up to $100,000 in credits for startups
2. **Financial Services Competency Partners** — Pre-vetted integrations with Plaid, Dwolla, etc.
3. **Compliance Accelerators** — AWS Artifact provides on-demand compliance reports
4. **Managed Services** — RDS, Lambda, API Gateway reduce ops overhead
5. **Multi-AZ by Default** — Built-in redundancy for critical services

### Recommended AWS Services:

| Service | Purpose |
|---------|---------|
| **ECS/Fargate** or **Lambda** | Compute (containerized API or serverless) |
| **RDS PostgreSQL** (Multi-AZ) | Primary database with ACID compliance |
| **ElastiCache Redis** | Session management, rate limiting, caching |
| **API Gateway** | REST/WebSocket APIs with built-in throttling |
| **Cognito** | User authentication (SMS verification) |
| **SQS/SNS** | Message queuing for async operations |
| **EventBridge** | Scheduled jobs (weekly rewards) |
| **CloudWatch** | Logging, metrics, alerting |
| **WAF** | Web application firewall |
| **Secrets Manager** | Secure credential storage |
| **S3** | Static assets, backups, audit logs |

---

## Banking Connectors & Money Movement

### Recommended Stack: **Plaid + Dwolla**

This combination provides the fastest path to production with minimal regulatory complexity.

### Architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER JOURNEY                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. ACCOUNT LINKING          2. LOAD MONEY         3. REDEEM   │
│  ┌─────────────┐            ┌─────────────┐      ┌───────────┐ │
│  │   Plaid     │            │   Dwolla    │      │  Dwolla   │ │
│  │   Link      │───────────▶│   ACH Pull  │      │  ACH Push │ │
│  │             │            │   (3-5 days)│      │  (1-3 days│ │
│  └─────────────┘            └─────────────┘      └───────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Option A: Plaid + Dwolla (RECOMMENDED for MVP)

| Component | Provider | Purpose | Pricing |
|-----------|----------|---------|---------|
| **Account Linking** | Plaid | Connect user bank accounts, verify ownership | $0.30-$0.50/link |
| **ACH Transfers** | Dwolla | Move money in/out via ACH | $0.05-$0.25/transfer |
| **Identity Verification** | Plaid Identity | Light KYC for higher limits | $1.50-$2.00/check |

**Why This Combo:**
- Plaid handles the complex bank connection UI/UX
- Dwolla is a registered money transmitter (you operate under their license)
- No need for your own money transmitter license initially
- Both have excellent developer documentation
- Combined setup time: 2-4 weeks

### Option B: Stripe Treasury (Alternative)

| Pros | Cons |
|------|------|
| All-in-one solution | Higher per-transaction fees |
| Stored value accounts built-in | More restrictive use cases |
| Instant verification | Waitlist for new accounts |

### Option C: Unit (Alternative for Scale)

| Pros | Cons |
|------|------|
| Full BaaS with cards, ACH, wires | Higher minimum commitments |
| Virtual accounts per user | More complex integration |
| Better for large scale | Overkill for MVP |

### Money Flow Architecture:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           MONEY FLOW                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   USER BANK                PAYA RESERVE              USER WALLET     │
│   ┌───────┐               ┌─────────────────┐          ┌───────────┐   │
│   │ $100  │──ACH PULL────▶│  Reserve Bank   │          │           │   │
│   │       │   (Dwolla)    │  Account        │──────────▶│ 100 tokens│   │
│   └───────┘               │  (FBO Account)  │  mint     │           │   │
│                           │                 │          └───────────┘   │
│   ┌───────┐               │  Always ≥       │          ┌───────────┐   │
│   │ +$50  │◀──ACH PUSH────│  Total Tokens   │◀─────────│ 50 tokens │   │
│   │       │   (Dwolla)    │  in Circulation │  burn    │ redeemed  │   │
│   └───────┘               └─────────────────┘          └───────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Reserve Account Setup:

With Dwolla's "white-label" solution:
1. You hold one master FBO (For Benefit Of) account
2. Each user has a virtual sub-account (ledger entry, not actual bank account)
3. Reserve balance = Sum of all user token balances × $1
4. Daily reconciliation job verifies 1:1 backing

---

## Real-Time Data & Analytics

### Requirements:
1. **Public Feed** — Real-time updates when payments occur
2. **Dashboard** — Live stats on reserve, circulation, rewards
3. **Internal Analytics** — User behavior, fraud signals, system health

### Architecture Options:

#### Option A: Supabase (RECOMMENDED for MVP Speed)

```
┌────────────────────────────────────────────────────────────────┐
│                     SUPABASE ARCHITECTURE                      │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────┐   │
│  │   Supabase   │    │   Supabase   │    │   Supabase     │   │
│  │   Auth       │    │   Realtime   │    │   PostgreSQL   │   │
│  │   (SMS OTP)  │    │   (WebSocket)│    │   (Database)   │   │
│  └──────────────┘    └──────────────┘    └────────────────┘   │
│         │                   │                    │             │
│         └───────────────────┼────────────────────┘             │
│                             │                                  │
│                    ┌────────▼────────┐                         │
│                    │   Row Level     │                         │
│                    │   Security      │                         │
│                    │   (RLS)         │                         │
│                    └─────────────────┘                         │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Supabase Pros:**
- Built-in real-time subscriptions via PostgreSQL LISTEN/NOTIFY
- Row Level Security for fine-grained access control
- Hosted PostgreSQL with automatic backups
- Auth with SMS OTP support
- Edge Functions for serverless compute
- Fast to prototype and ship

**Supabase Cons:**
- Less control than raw AWS
- Vendor lock-in concerns at scale
- May need to migrate to self-hosted at very high scale

#### Option B: AWS Native (Better for Scale)

```
┌────────────────────────────────────────────────────────────────┐
│                     AWS NATIVE ARCHITECTURE                    │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────┐   │
│  │   Cognito    │    │ API Gateway  │    │   RDS          │   │
│  │   (Auth)     │    │ (WebSocket)  │    │   PostgreSQL   │   │
│  └──────────────┘    └──────────────┘    └────────────────┘   │
│         │                   │                    │             │
│         │            ┌──────▼──────┐             │             │
│         │            │   Lambda    │◀────────────┘             │
│         │            │ (handlers)  │                           │
│         │            └──────┬──────┘                           │
│         │                   │                                  │
│         │            ┌──────▼──────┐                           │
│         └───────────▶│  DynamoDB   │  (connection store)       │
│                      │  Streams    │──▶ fan-out to clients     │
│                      └─────────────┘                           │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Real-Time Feed Implementation:

```typescript
// Example: Real-time feed subscription (Supabase approach)
const feedSubscription = supabase
  .channel('public-payments')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'payments',
      filter: 'is_public=eq.true'
    },
    (payload) => {
      // New public payment - update feed UI
      addToFeed(payload.new);
    }
  )
  .subscribe();
```

### Analytics Pipeline:

```
┌─────────────────────────────────────────────────────────────────┐
│                    ANALYTICS PIPELINE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Events                  Stream Processing         Storage      │
│  ┌─────────┐            ┌──────────────┐       ┌───────────┐   │
│  │ Payment │───────────▶│   Kinesis    │──────▶│    S3     │   │
│  │ Login   │            │   Firehose   │       │ (raw logs)│   │
│  │ Signup  │            └──────────────┘       └─────┬─────┘   │
│  │ Redeem  │                                         │         │
│  └─────────┘                                   ┌─────▼─────┐   │
│                                                │  Athena   │   │
│                           ┌────────────────────│  (query)  │   │
│                           │                    └───────────┘   │
│                           ▼                                    │
│                    ┌─────────────┐                              │
│                    │  QuickSight │  (dashboards)                │
│                    │  or Metabase│                              │
│                    └─────────────┘                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Metrics to Track:

| Category | Metrics |
|----------|---------|
| **User** | DAU, WAU, MAU, signup rate, churn |
| **Transactions** | Volume, avg size, public vs private ratio |
| **Money Flow** | Load volume, redemption volume, net flow |
| **Rewards** | Pool size, per-user reward, active user count |
| **Health** | API latency, error rates, queue depths |

---

## Security Architecture

### Multi-Layer Security Model:

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 1: EDGE                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  CloudFlare/AWS WAF → DDoS protection, bot filtering    │   │
│  │  Rate Limiting → 100 req/min per user                   │   │
│  │  Geo-blocking → US-only for MVP (regulatory simplicity) │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Layer 2: AUTHENTICATION                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  SMS OTP verification (Twilio/AWS SNS)                  │   │
│  │  JWT tokens with short expiry (15min access, 7d refresh)│   │
│  │  Device fingerprinting for session binding              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Layer 3: AUTHORIZATION                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Row Level Security (RLS) in PostgreSQL                 │   │
│  │  User can only access own wallet/transactions           │   │
│  │  Admin roles for account freeze/support                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Layer 4: DATA PROTECTION                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  TLS 1.3 for all transit                                │   │
│  │  AES-256 encryption at rest (RDS, S3)                   │   │
│  │  Field-level encryption for PII (phone, bank tokens)    │   │
│  │  Secrets in AWS Secrets Manager (never in code)         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Layer 5: MONITORING & RESPONSE                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Real-time anomaly detection (unusual transfer patterns)│   │
│  │  Audit logging (all money movements, admin actions)     │   │
│  │  Automated alerts (PagerDuty/Opsgenie)                  │   │
│  │  Incident response playbooks                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Fraud Prevention Rules (MVP):

```typescript
// Example fraud detection rules
const FRAUD_RULES = {
  // Rate limits
  MAX_SENDS_PER_HOUR: 10,
  MAX_SENDS_PER_DAY: 50,
  MAX_SINGLE_TRANSFER: 1000, // tokens
  
  // New account restrictions
  NEW_ACCOUNT_COOLING_PERIOD_DAYS: 7,
  NEW_ACCOUNT_MAX_LOAD: 100, // first week
  NEW_ACCOUNT_NO_REDEEM_DAYS: 14,
  
  // Velocity checks
  MAX_UNIQUE_RECIPIENTS_PER_DAY: 20,
  MAX_LOAD_PER_WEEK: 2000,
  
  // Pattern detection
  CIRCULAR_PAYMENT_WINDOW_HOURS: 24,
  MIN_ACCOUNT_AGE_FOR_REWARDS_DAYS: 7,
};

// Flag accounts for review when:
// - Receiving from 10+ unique senders in 24h (money mule pattern)
// - Sending to same recipient 5+ times in 1h
// - Load immediately followed by send to new account
// - Private-only transactions (no public participation)
```

### Compliance Checklist:

| Requirement | Implementation |
|-------------|----------------|
| **KYC** | Phone verification (MVP), Plaid Identity (future) |
| **AML** | Partner with Dwolla (they handle SAR filing) |
| **PCI-DSS** | Use Plaid/Dwolla tokens, never store card numbers |
| **SOC 2** | AWS provides, document your controls |
| **State Licenses** | Operate under Dwolla's MTL initially |
| **Privacy** | Privacy policy, data retention limits, deletion requests |

### Admin Controls:

```typescript
// Admin actions available
interface AdminActions {
  freezeAccount(userId: string, reason: string): Promise<void>;
  unfreezeAccount(userId: string): Promise<void>;
  flagForReview(userId: string, reason: string): Promise<void>;
  markIneligibleForRewards(userId: string, weeks: number): Promise<void>;
  viewTransactionHistory(userId: string): Promise<Transaction[]>;
  adjustBalance(userId: string, amount: number, reason: string): Promise<void>;
  generateComplianceReport(dateRange: DateRange): Promise<Report>;
}
```

---

## Redundancy & High Availability

### Target SLAs:

| Metric | Target |
|--------|--------|
| **Uptime** | 99.9% (8.76 hours downtime/year) |
| **API Latency** | p95 < 200ms |
| **Data Durability** | 99.999999999% (11 nines) |
| **RTO** (Recovery Time Objective) | < 15 minutes |
| **RPO** (Recovery Point Objective) | < 1 minute |

### Multi-Layer Redundancy:

```
┌─────────────────────────────────────────────────────────────────┐
│                    HIGH AVAILABILITY ARCHITECTURE               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                         REGION: us-east-1                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │    AZ-a                AZ-b                AZ-c        │   │
│  │  ┌───────┐           ┌───────┐           ┌───────┐     │   │
│  │  │ ECS   │           │ ECS   │           │ ECS   │     │   │
│  │  │ Tasks │           │ Tasks │           │ Tasks │     │   │
│  │  └───┬───┘           └───┬───┘           └───┬───┘     │   │
│  │      │                   │                   │         │   │
│  │      └───────────────────┼───────────────────┘         │   │
│  │                          │                             │   │
│  │                   ┌──────▼──────┐                      │   │
│  │                   │     ALB     │                      │   │
│  │                   │  (L7 Load   │                      │   │
│  │                   │   Balancer) │                      │   │
│  │                   └─────────────┘                      │   │
│  │                                                         │   │
│  │    ┌──────────────────────────────────────────────┐    │   │
│  │    │              RDS PostgreSQL                  │    │   │
│  │    │  ┌────────┐    sync    ┌────────┐           │    │   │
│  │    │  │Primary │───────────▶│Standby │           │    │   │
│  │    │  │ (AZ-a) │            │ (AZ-b) │           │    │   │
│  │    │  └────────┘            └────────┘           │    │   │
│  │    │       │                                     │    │   │
│  │    │       │ async replica                       │    │   │
│  │    │       ▼                                     │    │   │
│  │    │  ┌────────┐                                 │    │   │
│  │    │  │ Read   │ (for dashboard queries)        │    │   │
│  │    │  │Replica │                                 │    │   │
│  │    │  └────────┘                                 │    │   │
│  │    └──────────────────────────────────────────────┘    │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     FAILOVER REGION: us-west-2          │   │
│  │  (Warm standby with cross-region read replica)          │   │
│  │  Activated via Route 53 health checks                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Database Redundancy Strategy:

```
PRIMARY STRATEGY: Multi-AZ RDS
├── Synchronous replication to standby (same region, different AZ)
├── Automatic failover in 60-120 seconds
├── Zero data loss (RPO = 0)
└── No manual intervention required

SECONDARY STRATEGY: Cross-Region Read Replica
├── Asynchronous replication to us-west-2
├── Manual promotion if primary region fails
├── RPO = seconds to minutes
└── Used for disaster recovery only

BACKUP STRATEGY:
├── Automated daily snapshots (retained 30 days)
├── Transaction logs shipped to S3 every 5 minutes
├── Point-in-time recovery up to 5 minutes ago
└── Monthly backup tested for restore capability
```

### Circuit Breaker Pattern:

```typescript
// Prevent cascade failures when external services fail
interface CircuitBreaker {
  // States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing)
  
  // If Plaid is down, queue loads instead of failing
  plaidService: CircuitBreaker;
  
  // If Dwolla is down, queue transfers for retry
  dwollaService: CircuitBreaker;
  
  // If SMS provider is down, fall back to backup provider
  smsService: CircuitBreaker;
}

// Example: Dual SMS provider for auth redundancy
const sendSMS = async (phone: string, code: string) => {
  try {
    await twilioClient.send(phone, code);
  } catch (e) {
    // Fallback to AWS SNS
    await snsClient.send(phone, code);
  }
};
```

### Graceful Degradation Modes:

| Failure | User Impact | Mitigation |
|---------|-------------|------------|
| **Plaid down** | Can't link new banks | Show "temporarily unavailable", queue requests |
| **Dwolla down** | Can't load/redeem | P2P still works, queue money movements |
| **Primary DB down** | None (auto-failover) | Automatic promotion of standby |
| **Read replica down** | Dashboard slower | Fall back to primary for reads |
| **Redis down** | Slower + no rate limits | Use DB-backed sessions, relax limits briefly |
| **Region down** | 15-30 min recovery | DNS failover to warm standby region |

---

## Technology Stack Recommendation

### MVP Stack (Optimized for Speed):

```
┌─────────────────────────────────────────────────────────────────┐
│                    RECOMMENDED MVP STACK                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FRONTEND                                                       │
│  ├── React Native (Expo) — iOS + Android from single codebase   │
│  ├── TypeScript — type safety                                   │
│  └── TanStack Query — data fetching + caching                   │
│                                                                 │
│  BACKEND                                                        │
│  ├── Node.js + TypeScript — fast development                    │
│  ├── Fastify or Express — API framework                         │
│  ├── Prisma — type-safe ORM                                     │
│  └── Zod — runtime validation                                   │
│                                                                 │
│  DATABASE                                                       │
│  ├── PostgreSQL — ACID compliance, JSON support                 │
│  ├── Redis — caching, rate limiting, sessions                   │
│  └── S3 — file storage, audit logs                              │
│                                                                 │
│  INFRASTRUCTURE                                                 │
│  ├── AWS (ECS Fargate or Lambda)                                │
│  ├── RDS PostgreSQL (Multi-AZ)                                  │
│  ├── ElastiCache Redis                                          │
│  ├── CloudFront — CDN                                           │
│  └── Route 53 — DNS with health checks                          │
│                                                                 │
│  EXTERNAL SERVICES                                              │
│  ├── Plaid — bank account linking                               │
│  ├── Dwolla — ACH transfers                                     │
│  ├── Twilio — SMS OTP                                           │
│  └── Sentry — error tracking                                    │
│                                                                 │
│  DEVOPS                                                         │
│  ├── GitHub Actions — CI/CD                                     │
│  ├── Terraform — infrastructure as code                         │
│  ├── Docker — containerization                                  │
│  └── DataDog or CloudWatch — monitoring                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Alternative: Supabase-First Stack (Even Faster MVP):

```
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE-FIRST STACK                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FRONTEND                                                       │
│  ├── React Native (Expo)                                        │
│  ├── Supabase JS Client                                         │
│  └── Real-time subscriptions built-in                           │
│                                                                 │
│  BACKEND                                                        │
│  ├── Supabase PostgreSQL — database                             │
│  ├── Supabase Auth — SMS OTP                                    │
│  ├── Supabase Edge Functions — serverless logic                 │
│  ├── Supabase Realtime — WebSocket feeds                        │
│  └── Row Level Security — authorization                         │
│                                                                 │
│  EXTERNAL (still needed)                                        │
│  ├── Plaid — bank linking                                       │
│  ├── Dwolla — ACH transfers                                     │
│  └── Twilio (backup SMS)                                        │
│                                                                 │
│  PROS: 2-3 week MVP possible                                    │
│  CONS: May need migration at scale                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Infrastructure Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PAYA INFRASTRUCTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   USERS                          CDN                        EXTERNAL APIs   │
│   ┌─────┐                   ┌──────────┐                   ┌───────────┐   │
│   │ iOS │                   │CloudFront│                   │   Plaid   │   │
│   │ App │──────┐            │   (CDN)  │                   │  (banks)  │   │
│   └─────┘      │            └────┬─────┘                   └─────┬─────┘   │
│                │                 │                               │         │
│   ┌─────┐      │            ┌────▼─────┐                   ┌─────▼─────┐   │
│   │Andr.│──────┼───────────▶│   WAF    │                   │  Dwolla   │   │
│   │ App │      │            │(firewall)│                   │  (ACH)    │   │
│   └─────┘      │            └────┬─────┘                   └─────┬─────┘   │
│                │                 │                               │         │
│   ┌─────┐      │            ┌────▼─────┐                   ┌─────▼─────┐   │
│   │ Web │──────┘            │   ALB    │                   │  Twilio   │   │
│   │(fut)│                   │  (load   │                   │  (SMS)    │   │
│   └─────┘                   │ balancer)│                   └───────────┘   │
│                             └────┬─────┘                                   │
│                                  │                                         │
│   ┌──────────────────────────────┼──────────────────────────────────────┐  │
│   │                         VPC (Private Network)                       │  │
│   │                              │                                      │  │
│   │  ┌───────────────────────────┼───────────────────────────────────┐ │  │
│   │  │                    ECS Cluster                                │ │  │
│   │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │ │  │
│   │  │  │  API        │  │  Worker     │  │  Scheduler  │           │ │  │
│   │  │  │  Service    │  │  Service    │  │  (weekly    │           │ │  │
│   │  │  │  (REST)     │  │  (async)    │  │   rewards)  │           │ │  │
│   │  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘           │ │  │
│   │  │         │                │                │                   │ │  │
│   │  └─────────┼────────────────┼────────────────┼───────────────────┘ │  │
│   │            │                │                │                      │  │
│   │            └────────────────┼────────────────┘                      │  │
│   │                             │                                       │  │
│   │  ┌──────────────────────────┼────────────────────────────────────┐ │  │
│   │  │                          ▼                                    │ │  │
│   │  │  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐         │ │  │
│   │  │  │    RDS      │   │ ElastiCache │   │     S3      │         │ │  │
│   │  │  │ PostgreSQL  │   │   Redis     │   │  (backups,  │         │ │  │
│   │  │  │ (Multi-AZ)  │   │  (cluster)  │   │   logs)     │         │ │  │
│   │  │  └─────────────┘   └─────────────┘   └─────────────┘         │ │  │
│   │  │                     DATA LAYER                                │ │  │
│   │  └───────────────────────────────────────────────────────────────┘ │  │
│   │                                                                     │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Cost Estimation

### Monthly Costs (MVP Scale: 100-1,000 users):

| Service | Specification | Est. Monthly Cost |
|---------|---------------|-------------------|
| **ECS Fargate** | 2 tasks, 0.5 vCPU, 1GB RAM | $30-50 |
| **RDS PostgreSQL** | db.t3.medium, Multi-AZ | $100-150 |
| **ElastiCache Redis** | cache.t3.micro | $15-25 |
| **ALB** | Load balancer | $20-30 |
| **CloudFront** | CDN | $10-20 |
| **S3** | Storage + backups | $5-10 |
| **CloudWatch** | Logs + metrics | $20-30 |
| **Secrets Manager** | 5-10 secrets | $5 |
| **Route 53** | DNS | $2 |
| **Plaid** | ~200 links/month | $60-100 |
| **Dwolla** | ~500 transfers/month | $25-125 |
| **Twilio** | ~1,000 SMS/month | $10-20 |
| **Sentry** | Error tracking | $26 |
| | | |
| **TOTAL** | | **$330-590/month** |

### Scaling to 10,000 users:

| Service | Est. Monthly Cost |
|---------|-------------------|
| Compute (more tasks) | $150-300 |
| Database (larger instance) | $300-500 |
| Plaid/Dwolla (volume) | $500-1,500 |
| Other services | $200-400 |
| **TOTAL** | **$1,150-2,700/month** |

### Cost Optimization Tips:

1. **AWS Reserved Instances** — 30-50% savings on RDS/ElastiCache
2. **Spot Instances** — For non-critical workloads
3. **AWS Activate** — Apply for $100K credits
4. **Plaid volume pricing** — Negotiate at 1,000+ verifications/month
5. **Dwolla scale pricing** — Negotiate at $50K+ monthly transfer volume

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
```
□ Set up AWS account and IAM
□ Configure VPC, security groups
□ Deploy RDS PostgreSQL (Multi-AZ)
□ Deploy ElastiCache Redis
□ Set up CI/CD pipeline
□ Create database schema
□ Implement basic API structure
```

### Phase 2: Authentication (Week 3)
```
□ Integrate Twilio SMS OTP
□ Implement JWT auth flow
□ Device session management
□ Rate limiting middleware
□ @username registration
```

### Phase 3: Banking Integration (Weeks 4-5)
```
□ Plaid Link integration
□ Dwolla account setup
□ ACH pull (load money)
□ ACH push (redeem money)
□ Webhook handlers
□ Balance reconciliation
```

### Phase 4: Core Features (Weeks 6-7)
```
□ Wallet/balance system
□ P2P transfer logic
□ Public/private payment flag
□ Transaction history
□ Real-time feed
```

### Phase 5: Rewards System (Week 8)
```
□ Weekly revenue tracking
□ Active user calculation
□ Reward distribution job
□ Ops allocation logic
□ Public transparency dashboard
```

### Phase 6: Safety & Polish (Weeks 9-10)
```
□ Fraud detection rules
□ Admin panel (freeze/flag)
□ Comprehensive logging
□ Error handling
□ Load testing
□ Security audit
□ Beta testing with 20-100 users
```

---

## Key Decisions Summary

| Decision | Recommendation | Rationale |
|----------|----------------|-----------|
| **Cloud** | AWS | Best fintech ecosystem, startup credits, compliance |
| **Database** | PostgreSQL | ACID compliance, JSON support, mature tooling |
| **Bank Linking** | Plaid | Industry standard, best UX, fast integration |
| **ACH Transfers** | Dwolla | Operates under their MTL, simple API |
| **Auth** | SMS OTP (Twilio) | Simple for MVP, phone-first |
| **Real-time** | WebSockets (native or Supabase) | Required for live feed |
| **Redundancy** | Multi-AZ + warm DR region | Balances cost vs availability |

---

## Next Steps

1. **Apply for AWS Activate** — Get startup credits
2. **Register for Plaid sandbox** — Start bank link integration
3. **Contact Dwolla sales** — Understand onboarding requirements
4. **Define database schema** — Users, wallets, transactions, payments
5. **Create Terraform/IaC foundation** — Infrastructure as code from day 1
6. **Build auth flow first** — SMS OTP, @username, sessions

---

*Document Version: 1.0*  
*Last Updated: November 2024*  
*Author: Technical Planning*

