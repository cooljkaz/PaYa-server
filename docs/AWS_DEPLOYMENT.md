# AWS Deployment Guide for PaYa

Complete guide for deploying the PaYa API server to AWS using the $100k credits.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Application Load Balancer             │
│                      (HTTPS/TLS)                         │
└────────────────────────┬────────────────────────────────┘
                         │
                    ┌────▼────┐
                    │  ECS    │
                    │ Fargate │
                    │  Task   │
                    └────┬────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
    ┌────▼────┐                    ┌─────▼─────┐
    │Supabase │                    │ElastiCache│
    │Postgres │                    │  Redis    │
    │(External)│                   └───────────┘
    └─────────┘
```

**Note:** Using Supabase PostgreSQL (external service) instead of AWS RDS to save costs and leverage existing setup.

## 📋 Prerequisites

1. **AWS Account** with $100k credits approved
2. **AWS CLI** installed and configured
   ```bash
   aws configure
   # Enter your Access Key ID, Secret Access Key, region (us-east-1), and output format (json)
   ```
3. **Node.js 18+** and **pnpm**
4. **Docker** installed and running
5. **AWS CDK** installed globally:
   ```bash
   npm install -g aws-cdk
   ```

## 🚀 Quick Start (10 minutes)

### Step 1: Install Infrastructure Dependencies

```bash
cd M:/Projects/OpenPay/server/infrastructure
pnpm install
```

### Step 2: Bootstrap CDK (First Time Only)

```bash
cdk bootstrap
```

This creates the CDK bootstrap stack in your AWS account.

### Step 3: Deploy Infrastructure

**For Staging:**
```bash
cd infrastructure
pnpm deploy:staging
```

**For Production:**
```bash
pnpm deploy:production
```

This will create:
- VPC with public/private subnets
- ECS Fargate cluster
- RDS PostgreSQL database
- ElastiCache Redis
- Application Load Balancer
- ECR repository
- Secrets Manager secrets

⏱️ **Takes ~15-20 minutes** for initial deployment

### Step 4: Build and Push Docker Image

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

Or manually:

```bash
# Build image
docker build -t paya-api:latest -f Dockerfile .

# Get ECR repo URI from CDK outputs
ECR_REPO=$(aws cloudformation describe-stacks \
  --stack-name PaYaStackStaging \
  --query "Stacks[0].Outputs[?OutputKey=='ECRRepositoryURI'].OutputValue" \
  --output text)

# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $ECR_REPO

# Tag and push
docker tag paya-api:latest $ECR_REPO:latest
docker push $ECR_REPO:latest
```

### Step 5: Configure Secrets

**Get your Supabase connection string:**
1. Go to [supabase.com](https://supabase.com)
2. Open your project
3. Go to **Settings** → **Database**
4. Copy the **Connection string** (URI format)
   - Should look like: `postgresql://postgres:[password]@[host]:5432/postgres?sslmode=require`

**Configure AWS Secrets:**
Go to AWS Console → **Secrets Manager** → Find `paya-staging-app-secrets`

Edit the secret and add:

```json
{
  "databaseUrl": "postgresql://postgres:[password]@[host]:5432/postgres?sslmode=require",
  "jwtAccessSecret": "your-strong-random-secret-here",
  "jwtRefreshSecret": "your-strong-random-secret-here",
  "redisUrl": "redis://[redis-endpoint]:6379",
  "twilioAccountSid": "AC...",
  "twilioAuthToken": "...",
  "twilioPhoneNumber": "+1234567890",
  "syncteraApiKey": "...",
  "plaidClientId": "...",
  "plaidSecret": "..."
}
```

**Note:** The `redisUrl` will be automatically set after deployment. Get it from CloudFormation outputs or construct it from the Redis endpoint.

**Generate secrets:**
```bash
# Generate JWT secrets
openssl rand -hex 32
```

### Step 6: Update ECS Service

After pushing the image, force a new deployment:

```bash
# Get cluster and service names
CLUSTER=$(aws ecs list-clusters --query "clusterArns[0]" --output text | awk -F'/' '{print $NF}')
SERVICE=$(aws ecs list-services --cluster $CLUSTER --query "serviceArns[0]" --output text | awk -F'/' '{print $NF}')

# Force new deployment
aws ecs update-service \
  --cluster $CLUSTER \
  --service $SERVICE \
  --force-new-deployment
```

### Step 7: Run Database Migrations

You'll need to run Prisma migrations. Options:

**Option A: Via ECS Task (Recommended)**

Create a one-off task to run migrations:

```bash
# Get your cluster and task definition
CLUSTER=$(aws ecs list-clusters --query "clusterArns[0]" --output text | awk -F'/' '{print $NF}')
TASK_DEF=$(aws ecs list-task-definitions --query "taskDefinitionArns[0]" --output text)

# Get VPC configuration
SUBNET=$(aws ec2 describe-subnets \
  --filters "Name=tag:aws-cdk:subnet-name,Values=Private" \
  --query "Subnets[0].SubnetId" --output text)
SG=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=*FargateService*" \
  --query "SecurityGroups[0].GroupId" --output text)

# Run migration task
aws ecs run-task \
  --cluster $CLUSTER \
  --task-definition $TASK_DEF \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET],securityGroups=[$SG],assignPublicIp=DISABLED}" \
  --overrides '{
    "containerOverrides": [{
      "name": "FargateContainer",
      "command": ["sh", "-c", "cd /app/apps/api && pnpm db:push"]
    }]
  }'
```

**Option B: Via Bastion Host**

Create a small EC2 instance in your VPC, SSH in, install dependencies, and run migrations.

### Step 8: Get Your Public URL

```bash
aws cloudformation describe-stacks \
  --stack-name PaYaStackStaging \
  --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerDNS'].OutputValue" \
  --output text
```

This gives you the ALB DNS name like: `PaYaSta-XXXXX-1234567890.us-east-1.elb.amazonaws.com`

Test it:
```bash
curl http://<your-alb-dns>/health
```

### Step 9: Update Mobile App

Update `app/mobile/src/api/client.ts`:

```typescript
const API_BASE_URL = __DEV__
  ? Platform.OS === 'android'
    ? 'http://10.0.2.2:3000'
    : 'http://localhost:3000'
  : 'http://<your-alb-dns>'; // Your AWS ALB URL
```

For production, you'll want to set up a custom domain (see below).

## 🔧 Configuration

### Environment-Specific Settings

Edit `infrastructure/bin/app.ts` to customize:

- **Region**: Change `region: 'us-east-1'`
- **Instance sizes**: Edit `paya-stack.ts` for CPU/memory
- **Database size**: Edit RDS instance type
- **Domain**: Add your custom domain

### Scaling

**Auto-scaling** (add to `paya-stack.ts`):

```typescript
const scalableTarget = fargateService.service.autoScaleTaskCount({
  minCapacity: environment === 'production' ? 2 : 1,
  maxCapacity: environment === 'production' ? 10 : 3,
});

scalableTarget.scaleOnCpuUtilization('CpuScaling', {
  targetUtilizationPercent: 70,
});

scalableTarget.scaleOnMemoryUtilization('MemoryScaling', {
  targetUtilizationPercent: 80,
});
```

## 🌐 Custom Domain Setup

### Option 1: Route 53 + ACM (Recommended)

1. **Create ACM Certificate** (must be in `us-east-1` for ALB):

```bash
aws acm request-certificate \
  --domain-name api.paya.cash \
  --validation-method DNS \
  --region us-east-1
```

2. **Add DNS validation records** to your domain

3. **Update CDK stack** to use the certificate (add to `paya-stack.ts`)

4. **Create Route 53 hosted zone** and A record pointing to ALB

### Option 2: CloudFlare + Custom Domain

1. Point your domain to CloudFlare
2. Create CNAME: `api.paya.cash` → `<your-alb-dns>`
3. Enable SSL/TLS (Full mode)

## 💰 Cost Breakdown

With AWS $1,000 credits (~$83/month):

### Staging Environment (Cost-Optimized)
- **ECS Fargate**: ~$15/month (1 task, 0.5 vCPU, 1GB RAM)
- **ElastiCache Redis**: ~$12/month (cache.t3.micro, single node)
- **Application Load Balancer**: ~$20/month
- **NAT Gateway**: ~$32/month ⚠️ (consider NAT instance to save $27/month)
- **ECR**: ~$1/month
- **Data Transfer**: ~$5/month
- **Supabase PostgreSQL**: External (Free tier or $25/month Pro)
- **Total AWS**: ~$85/month (or ~$58/month with NAT instance)

**Combined (AWS + Supabase Pro)**: ~$110/month (or ~$83/month with NAT instance)

**$1,000 credits = 9-12 months** 🎉

See `infrastructure/COST_OPTIMIZED.md` for maximum savings options.

## 📊 Monitoring

### CloudWatch Logs

View logs:
```bash
aws logs tail /ecs/paya-staging --follow
```

### CloudWatch Metrics

Monitor in AWS Console:
- ECS → Clusters → Your Cluster → Metrics
- RDS → Databases → Your DB → Monitoring
- ElastiCache → Your Cache → Monitoring

### Set Up Alarms

```bash
# Example: Alert on high CPU
aws cloudwatch put-metric-alarm \
  --alarm-name paya-high-cpu \
  --alarm-description "Alert when CPU > 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2
```

## 🔒 Security Best Practices

1. ✅ **Secrets in Secrets Manager** (already configured)
2. ✅ **Database in private subnets** (already configured)
3. ✅ **Redis with encryption** (already configured)
4. ✅ **Security groups** restrict access (already configured)
5. 🔲 **Enable AWS WAF** on ALB (recommended)
6. 🔲 **Enable AWS GuardDuty** (recommended)
7. 🔲 **Regular security updates** (set up CI/CD)

## 🚨 Troubleshooting

### ECS Tasks Keep Restarting

Check logs:
```bash
aws logs tail /ecs/paya-staging --follow
```

Common issues:
- Missing secrets in Secrets Manager
- Wrong DATABASE_URL format
- Security group blocking database access

### Database Connection Failed

1. Check security groups allow ECS → RDS
2. Verify DATABASE_URL in secrets
3. Check RDS is in same VPC

### Image Push Failed

```bash
# Re-authenticate with ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <ECR-REPO-URI>
```

## 🔄 CI/CD Setup (Future)

Set up GitHub Actions to automatically:
1. Build Docker image on push
2. Push to ECR
3. Deploy to ECS
4. Run migrations

See `infrastructure/.github/workflows/` (create this)

## 📝 Next Steps

1. ✅ Deploy infrastructure
2. ✅ Build and push image
3. ✅ Configure secrets
4. ✅ Run migrations
5. 🔲 Set up custom domain
6. 🔲 Configure auto-scaling
7. 🔲 Set up monitoring/alerts
8. 🔲 Set up CI/CD pipeline
9. 🔲 Enable CloudFront CDN
10. 🔲 Set up backup strategy

## 🆘 Support

- Check CloudWatch logs first
- Review CDK deployment outputs
- AWS Console → CloudFormation → Your Stack → Events
- AWS Support (if you have a support plan)

---

**Ready to deploy?** Start with Step 1 above! 🚀

