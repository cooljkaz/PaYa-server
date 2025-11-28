# PaYa Technical Decision Matrix

Quick reference for key architecture decisions.

---

## Banking Connector Comparison

| Provider | Account Linking | ACH In | ACH Out | MTL Coverage | Setup Time | MVP Cost/mo |
|----------|----------------|--------|---------|--------------|------------|-------------|
| **Plaid + Dwolla** ⭐ | ✅ Plaid | ✅ Dwolla | ✅ Dwolla | ✅ Dwolla's license | 2-4 weeks | $200-400 |
| Stripe Treasury | ✅ Built-in | ✅ Built-in | ✅ Built-in | ✅ Stripe's | 4-8 weeks (waitlist) | $300-600 |
| Unit | ✅ Built-in | ✅ Built-in | ✅ Built-in | ✅ Unit's | 6-8 weeks | $500-1000 |
| Synapse (defunct) | ❌ | ❌ | ❌ | ❌ | N/A | N/A |

**Recommendation: Plaid + Dwolla** — Fastest to market, well-documented, operates under their money transmitter license.

---

## Cloud Platform Comparison

| Criteria | AWS | GCP | Azure |
|----------|-----|-----|-------|
| **Fintech Maturity** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **Startup Credits** | $100K (Activate) | $100K (for Startups) | $25K-150K (BizSpark) |
| **Compliance Tools** | Excellent | Good | Good |
| **Managed PostgreSQL** | RDS (excellent) | Cloud SQL (good) | Azure DB (good) |
| **Serverless** | Lambda (mature) | Cloud Functions | Functions |
| **Real-time/WebSocket** | API Gateway WS | Firebase | SignalR |
| **Learning Curve** | Steep | Moderate | Steep |
| **Partner Ecosystem** | Largest | Growing | Enterprise-focused |

**Recommendation: AWS** — Most mature fintech ecosystem, best compliance tooling, largest partner network.

---

## Database Options

| Option | Pros | Cons | Best For |
|--------|------|------|----------|
| **AWS RDS PostgreSQL** ⭐ | Multi-AZ, managed backups, PITR | Higher cost | Production |
| Supabase | Real-time built-in, fast dev | Less control | Rapid MVP |
| PlanetScale (MySQL) | Branching, scaling | No PostgreSQL | If you prefer MySQL |
| CockroachDB | Distributed, multi-region | Complexity | Global scale |
| Aurora PostgreSQL | Auto-scaling, fast failover | Cost | High-traffic |

**Recommendation: RDS PostgreSQL Multi-AZ** — Best balance of features, reliability, and cost for fintech.

---

## Real-Time Architecture Options

| Approach | Latency | Complexity | Cost | Best For |
|----------|---------|------------|------|----------|
| **Supabase Realtime** | ~100ms | Low | $$ | Fast MVP |
| AWS API Gateway WebSocket | ~50ms | Medium | $$$ | AWS-native |
| Pusher | ~100ms | Low | $$ | Simple real-time |
| Socket.io (self-hosted) | ~30ms | High | $ | Full control |
| Firebase Realtime DB | ~100ms | Low | $$ | Mobile-first |

**Recommendation: Start with Supabase Realtime or AWS WebSocket** — Can migrate later if needed.

---

## Authentication Options

| Method | Security | UX | Cost | Implementation |
|--------|----------|-----|------|----------------|
| **SMS OTP** ⭐ | Medium | Good | $0.01/SMS | 1 week |
| Email Magic Link | Medium | Good | ~Free | 1 week |
| Social Login | Low-Medium | Great | Free | 2-3 days |
| Passkeys/WebAuthn | High | Medium | Free | 2-3 weeks |
| Full KYC (ID + Selfie) | High | Poor | $1-3/verify | 3-4 weeks |

**Recommendation for MVP: SMS OTP** — Familiar, phone-first, moderate security. Add KYC later for higher limits.

---

## Security Stack

| Layer | Recommended Tool | Alternative | Priority |
|-------|------------------|-------------|----------|
| **WAF/DDoS** | AWS WAF | Cloudflare | P0 |
| **Rate Limiting** | Redis + middleware | API Gateway | P0 |
| **Encryption (transit)** | TLS 1.3 | - | P0 |
| **Encryption (rest)** | RDS encryption | - | P0 |
| **Secrets** | AWS Secrets Manager | HashiCorp Vault | P0 |
| **Auth** | JWT + SMS OTP | Cognito | P0 |
| **Monitoring** | CloudWatch + Sentry | DataDog | P1 |
| **Fraud Detection** | Custom rules | Sift, Sardine | P2 |

---

## Redundancy Strategies

| Component | Strategy | RTO | RPO | Cost Impact |
|-----------|----------|-----|-----|-------------|
| **Database** | Multi-AZ + Read Replica | 60-120s | 0 | +50% |
| **Compute** | Multi-AZ ECS/Fargate | Instant | N/A | +30% |
| **Cache** | ElastiCache cluster | Instant | N/A | +50% |
| **Region** | Warm standby (DR) | 15-30min | <1min | +80% |
| **Banking API** | Queue + retry | Graceful | N/A | Minimal |
| **SMS** | Dual provider | Instant | N/A | Minimal |

**MVP Recommendation:** Multi-AZ everything, skip cross-region DR initially. Add after product-market fit.

---

## Cost Tiers

### Tier 1: Bootstrap MVP ($300-500/mo)
- Supabase Pro ($25) + Edge Functions
- Plaid Development (~$50-100)
- Dwolla Starter (~$50-150)
- Twilio (~$20)
- Domain + misc ($20)

### Tier 2: Production MVP ($500-1000/mo)
- AWS RDS + ECS + basics
- Plaid + Dwolla production
- Monitoring + alerting
- Multi-AZ enabled

### Tier 3: Scale ($2000-5000/mo)
- Larger instances
- Cross-region DR
- Advanced monitoring
- Dedicated support plans

---

## Tech Stack Quick Reference

```
┌─────────────────────────────────────────┐
│           PAYA MVP STACK             │
├─────────────────────────────────────────┤
│                                         │
│  Mobile App                             │
│  ├── React Native (Expo)                │
│  ├── TypeScript                         │
│  └── TanStack Query                     │
│                                         │
│  Backend API                            │
│  ├── Node.js + TypeScript               │
│  ├── Fastify                            │
│  ├── Prisma ORM                         │
│  └── Zod validation                     │
│                                         │
│  Database                               │
│  ├── PostgreSQL (RDS Multi-AZ)          │
│  └── Redis (ElastiCache)                │
│                                         │
│  External Services                      │
│  ├── Plaid (bank linking)               │
│  ├── Dwolla (ACH transfers)             │
│  ├── Twilio (SMS OTP)                   │
│  └── Sentry (error tracking)            │
│                                         │
│  Infrastructure                         │
│  ├── AWS (ECS Fargate)                  │
│  ├── GitHub Actions (CI/CD)             │
│  └── Terraform (IaC)                    │
│                                         │
└─────────────────────────────────────────┘
```

---

## Action Items

### Week 1: Setup & Accounts
- [ ] Apply for AWS Activate credits
- [ ] Register Plaid developer account
- [ ] Contact Dwolla for sandbox access
- [ ] Set up Twilio account
- [ ] Create GitHub organization
- [ ] Initialize monorepo structure

### Week 2: Infrastructure
- [ ] Terraform for AWS base (VPC, RDS, ECS)
- [ ] CI/CD pipeline with GitHub Actions
- [ ] Database schema migration setup
- [ ] Development environment documentation

### Week 3: Core Backend
- [ ] Auth flow (SMS OTP, JWT)
- [ ] User registration (@username)
- [ ] Wallet creation
- [ ] Basic API structure

### Week 4-5: Banking Integration
- [ ] Plaid Link integration
- [ ] Dwolla account verification
- [ ] ACH pull (load money)
- [ ] ACH push (redeem money)

### Week 6-7: Features
- [ ] P2P transfer logic
- [ ] Public/private payments
- [ ] Transaction feed
- [ ] Real-time updates

### Week 8: Rewards & Dashboard
- [ ] Weekly cycle logic
- [ ] Reward distribution
- [ ] Public transparency dashboard
- [ ] Admin tools

### Week 9-10: Polish & Launch
- [ ] Fraud rules & rate limits
- [ ] Error handling
- [ ] Load testing
- [ ] Security review
- [ ] Beta launch (20-100 users)

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Dwolla rejection | Medium | High | Have Unit as backup |
| ACH delays | High | Medium | Set user expectations, queue UI |
| Fraud/abuse | High | High | Strict limits, manual review early |
| Scale issues | Low | Medium | Start with headroom, monitor closely |
| Plaid bank coverage | Low | Medium | Most US banks covered |
| Regulatory | Medium | High | Operate under Dwolla's license |

---

*Last Updated: November 2024*

