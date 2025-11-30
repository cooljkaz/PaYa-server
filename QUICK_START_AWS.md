# AWS Deployment Quick Start

Get your PaYa API running on AWS in 15 minutes!

## Prerequisites Checklist

- [ ] AWS Account with $100k credits
- [ ] AWS CLI installed: `aws --version`
- [ ] AWS CLI configured: `aws configure`
- [ ] Docker installed and running
- [ ] Node.js 18+ installed
- [ ] pnpm installed: `npm install -g pnpm`
- [ ] AWS CDK installed: `npm install -g aws-cdk`

## 5-Minute Setup

### 1. Install Infrastructure Code

```bash
cd M:/Projects/OpenPay/server/infrastructure
pnpm install
```

### 2. Bootstrap CDK (First Time Only)

```bash
cdk bootstrap
```

### 3. Deploy to Staging

```bash
pnpm deploy:staging
```

⏱️ Wait ~15 minutes for CloudFormation to create all resources.

### 4. Build & Deploy API

**Windows:**
```powershell
cd M:/Projects/OpenPay/server
.\scripts\deploy-to-aws.ps1 staging
```

**Linux/Mac:**
```bash
cd M:/Projects/OpenPay/server
chmod +x scripts/deploy-to-aws.sh
./scripts/deploy-to-aws.sh staging
```

### 5. Configure Secrets

**First, get your Supabase connection string:**
1. Go to [supabase.com](https://supabase.com) → Your project
2. Settings → Database → Copy connection string

**Then configure AWS Secrets:**
Go to: AWS Console → Secrets Manager → `paya-staging-app-secrets`

Click "Edit" and add:
- `databaseUrl`: Your Supabase PostgreSQL connection string
- Your API keys (Twilio, Plaid, Synctera, etc.)

### 6. Get Your API URL

```bash
aws cloudformation describe-stacks \
  --stack-name PaYaStackStaging \
  --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerDNS'].OutputValue" \
  --output text
```

Copy that URL and test:
```bash
curl http://<your-url>/health
```

### 7. Update Mobile App

Edit `app/mobile/src/api/client.ts`:

```typescript
const API_BASE_URL = __DEV__
  ? Platform.OS === 'android'
    ? 'http://10.0.2.2:3000'
    : 'http://localhost:3000'
  : 'http://<your-alb-url>'; // Paste your ALB URL here
```

## What Gets Created

- ✅ VPC with subnets across 2 AZs
- ✅ ECS Fargate cluster (serverless containers)
- ✅ ElastiCache Redis cache (single node, micro instance)
- ✅ Application Load Balancer (public URL)
- ✅ ECR repository (Docker images)
- ✅ Secrets Manager (secure credential storage)
- ✅ **Supabase PostgreSQL** (external - you configure separately)

## Cost

**AWS**: ~$85/month for staging
**Supabase**: Free tier or $25/month Pro
**Total**: ~$85-110/month

**$1,000 credits = 9-12 months** 🎉

See `infrastructure/COST_OPTIMIZED.md` for ways to reduce to ~$20-30/month

## Next Steps

1. Run database migrations (see AWS_DEPLOYMENT.md)
2. Set up custom domain
3. Deploy to production
4. Set up CI/CD

---

**Full details:** See `AWS_DEPLOYMENT.md` for comprehensive guide.

