# Cost-Optimized AWS Deployment ($1,000 Credits)

This infrastructure is optimized for a $1,000 AWS credit budget.

## Current Architecture

- **ECS Fargate** - API server (minimal resources)
- **ElastiCache Redis** - Single node, micro instance
- **Supabase PostgreSQL** - External (not AWS - separate billing)
- **Application Load Balancer** - Public endpoint

**Note:** RDS has been removed since you're using Supabase.

## Monthly Cost Breakdown

### AWS Costs (~$40-50/month):

- **ECS Fargate**: ~$15/month
  - 1 task, 0.5 vCPU, 1GB RAM
  - Minimal compute for staging/testing
- **ElastiCache Redis (cache.t3.micro)**: ~$12/month
  - Single node, no replication
- **Application Load Balancer**: ~$20/month
  - Fixed cost regardless of usage
- **ECR Storage**: ~$1/month
- **Data Transfer**: ~$5/month
- **VPC/NAT Gateway**: ~$32/month (NAT Gateway is expensive!)
  - **Option to reduce**: Use NAT Instance instead (~$5/month)

**Total AWS**: ~$40-50/month (or ~$30-35/month with NAT instance)

### Supabase Costs (Separate):

- **Free Tier**: $0/month (up to 500MB database, 2GB bandwidth)
- **Pro Tier**: $25/month (8GB database, 50GB bandwidth, better performance)

**Total Combined**: ~$55-75/month ($1,000 credits = ~13-18 months)

## Cost Reduction Options

### Option 1: Use NAT Instance Instead of NAT Gateway (Save ~$27/month)

Replace the NAT Gateway with a small EC2 instance acting as NAT:

```typescript
// In paya-stack.ts, replace NAT Gateway with:
const natInstance = new ec2.Instance(this, 'NATInstance', {
  instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.NANO),
  machineImage: ec2.MachineImage.latestAmazonLinux2023(),
  vpc,
  vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
  sourceDestCheck: false, // Required for NAT
  // Configure NAT routing...
});
```

**Savings**: ~$27/month → Total: ~$23-28/month

### Option 2: Remove ElastiCache (Save ~$12/month)

If your Redis usage is minimal, you could:
- Use Supabase Realtime features instead
- Or use a free Redis service (Upstash, Redis Cloud free tier)
- Or run Redis in ECS as a sidecar (saves money but less reliable)

**Savings**: ~$12/month → Total: ~$28-38/month

### Option 3: Use Single-AZ Deployment (Save ~$16/month)

Deploy everything in a single availability zone:

```typescript
const vpc = new ec2.Vpc(this, 'VPC', {
  maxAzs: 1, // Single AZ
  natGateways: 0, // Use NAT instance or no NAT
  // ...
});
```

**Savings**: ~$16/month → Total: ~$12-22/month

### Option 4: Combine All Optimizations (Maximum Savings)

- Single AZ
- NAT Instance
- Remove ElastiCache (use external Redis or skip)
- Minimal ECS resources

**Total**: ~$12-18/month → **$1,000 credits = 55-83 months!**

## Recommended Setup for $1,000 Budget

### Staging Environment (Current)
- Single AZ
- NAT Instance instead of NAT Gateway
- Minimal ECS (0.5 vCPU, 1GB)
- Micro ElastiCache (or external Redis)
- **Cost**: ~$20-25/month

### Production (When Ready)
- 2 AZs for high availability
- NAT Gateway (for reliability)
- Medium ECS instances (1 vCPU, 2GB)
- Small ElastiCache
- **Cost**: ~$80-100/month

**Staging + Production**: ~$100-125/month = **8-10 months on $1,000 credits**

## Setup Instructions

1. **Configure Supabase PostgreSQL**:
   - Create project at [supabase.com](https://supabase.com)
   - Get connection string from Project Settings → Database
   - Add to AWS Secrets Manager after deployment

2. **Deploy Infrastructure**:
   ```bash
   cd infrastructure
   pnpm install
   pnpm deploy:staging
   ```

3. **Set Secrets**:
   - Go to AWS Secrets Manager
   - Edit `paya-staging-app-secrets`
   - Add your Supabase `DATABASE_URL`
   - Add your API keys (Twilio, Plaid, etc.)

4. **Build & Deploy**:
   ```bash
   # Build Docker image
   docker build -t paya-api:latest -f Dockerfile .
   
   # Push to ECR and deploy
   ./scripts/deploy-to-aws.ps1 staging
   ```

## Monitoring Costs

Set up AWS Budgets to track spending:

```bash
aws budgets create-budget \
  --account-id $(aws sts get-caller-identity --query Account --output text) \
  --budget '{
    "BudgetName": "PaYa-Monthly",
    "BudgetLimit": {"Amount": "100", "Unit": "USD"},
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST"
  }' \
  --notifications-with-subscribers '[
    {
      "Notification": {
        "NotificationType": "ACTUAL",
        "ComparisonOperator": "GREATER_THAN",
        "Threshold": 80
      },
      "Subscribers": [{"SubscriptionType": "EMAIL", "Address": "your-email@example.com"}]
    }
  ]'
```

## Cost Alerts

Set up CloudWatch alarms for cost monitoring:
- Alert at 50% of monthly budget
- Alert at 80% of monthly budget
- Alert at 100% of monthly budget

---

**With optimizations, $1,000 should last you 6-12 months easily!** 🎉

