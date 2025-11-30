# PaYa AWS Infrastructure

This directory contains AWS CDK infrastructure code for deploying the PaYa API to AWS.

## Architecture

- **ECS Fargate** - Serverless container hosting for the API
- **RDS PostgreSQL** - Managed database
- **ElastiCache Redis** - Managed Redis cache
- **Application Load Balancer** - Load balancing and HTTPS termination
- **ECR** - Docker container registry
- **Secrets Manager** - Secure storage for credentials
- **CloudWatch** - Logging and monitoring

## Prerequisites

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured:
   ```bash
   aws configure
   ```
3. **Node.js** 18+ and **pnpm**
4. **Docker** for building images

## Setup

### 1. Install CDK (if not already installed)

```bash
npm install -g aws-cdk
cdk --version  # Should be 2.x
```

### 2. Install Infrastructure Dependencies

```bash
cd infrastructure
pnpm install
```

### 3. Bootstrap CDK (first time only)

```bash
cdk bootstrap
```

This creates the CDK bootstrap stack in your AWS account.

### 4. Build Docker Image

```bash
# From the server root directory
cd M:/Projects/OpenPay/server

# Build and tag the image
docker build -t paya-api:latest .

# Or use the deployment script (see below)
```

### 5. Push Image to ECR

After deploying the stack, you'll get an ECR repository URL. Push your image:

```bash
# Get your ECR repository URI from CDK outputs
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ECR-REPO-URI>

# Tag and push
docker tag paya-api:latest <ECR-REPO-URI>:latest
docker push <ECR-REPO-URI>:latest
```

### 6. Deploy Infrastructure

```bash
cd infrastructure

# Deploy staging
pnpm deploy:staging

# Or deploy production
pnpm deploy:production
```

### 7. Configure Secrets

After deployment, configure your secrets in AWS Secrets Manager:

```bash
# Database credentials are auto-generated, but you can update them

# Update app secrets
aws secretsmanager put-secret-value \
  --secret-id paya-staging-app-secrets \
  --secret-string '{
    "jwtAccessSecret": "your-access-secret",
    "jwtRefreshSecret": "your-refresh-secret",
    "twilioAccountSid": "...",
    "twilioAuthToken": "...",
    "twilioPhoneNumber": "...",
    "syncteraApiKey": "...",
    "plaidClientId": "...",
    "plaidSecret": "..."
  }'
```

Or use the AWS Console: Secrets Manager → Find your secret → Edit

### 8. Run Database Migrations

After the first deployment, run database migrations:

```bash
# Get task execution command (replace with your cluster/service name)
aws ecs run-task \
  --cluster PaYaStackStaging-Cluster-XXXX \
  --task-definition PaYaStackStaging-FargateServiceTaskDefinition-XXXX \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
  --overrides '{
    "containerOverrides": [{
      "name": "FargateContainer",
      "command": ["sh", "-c", "cd /app/apps/api && node -e \"require('./dist/index.js')\" && pnpm db:push"]
    }]
  }'
```

Or connect via EC2/bastion host or use AWS Systems Manager Session Manager.

## Configuration

### Environment Variables

Edit `bin/app.ts` to customize:
- AWS region
- Domain names
- Instance sizes
- Resource counts

### Secrets Structure

The stack expects secrets in this format:

**Database Secret** (auto-generated):
- `username`
- `password`
- `engine` (DATABASE_URL format)

**App Secret** (`paya-{env}-app-secrets`):
- `jwtAccessSecret`
- `jwtRefreshSecret`
- `redisUrl` (will be set automatically from ElastiCache endpoint)
- `twilioAccountSid`
- `twilioAuthToken`
- `twilioPhoneNumber`
- `syncteraApiKey`
- `plaidClientId`
- `plaidSecret`
- Any other API keys

## Deployment Workflow

### First Time Setup

1. Deploy infrastructure: `pnpm deploy:staging`
2. Build Docker image: `docker build -t paya-api:latest .`
3. Push to ECR (see step 5 above)
4. Configure secrets in Secrets Manager
5. Run database migrations
6. Update ECS service to use the new image

### Updating the API

```bash
# 1. Build new image
docker build -t paya-api:latest .

# 2. Push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ECR-REPO-URI>
docker tag paya-api:latest <ECR-REPO-URI>:latest
docker push <ECR-REPO-URI>:latest

# 3. Force new deployment (ECS will pull the new image)
aws ecs update-service \
  --cluster <cluster-name> \
  --service <service-name> \
  --force-new-deployment
```

## Cost Estimation

With AWS $100k credits:

**Staging Environment** (approx $50-100/month):
- ECS Fargate: ~$30/month (1 task, 0.5 vCPU, 1GB)
- RDS db.t3.micro: ~$15/month
- ElastiCache cache.t3.micro: ~$15/month
- ALB: ~$20/month
- Data transfer: ~$10/month

**Production Environment** (approx $200-400/month):
- ECS Fargate: ~$100/month (2 tasks, 1 vCPU, 2GB)
- RDS db.t3.medium: ~$60/month
- ElastiCache cache.t3.medium: ~$60/month
- ALB: ~$20/month
- Data transfer: ~$50/month

**Total**: ~$250-500/month (well within $100k credits = ~$8,333/month)

## Troubleshooting

### CDK Deployment Fails

- Check AWS credentials: `aws sts get-caller-identity`
- Ensure CDK is bootstrapped: `cdk bootstrap`
- Check IAM permissions

### ECS Tasks Won't Start

- Check CloudWatch logs: `/ecs/paya-{env}`
- Verify secrets exist in Secrets Manager
- Check security group rules
- Verify Docker image is accessible in ECR

### Database Connection Issues

- Check security groups allow traffic from ECS tasks
- Verify database endpoint is correct
- Check database credentials in Secrets Manager

### Redis Connection Issues

- Verify ElastiCache security group allows ECS tasks
- Check Redis endpoint configuration
- Ensure transit encryption is disabled in app if enabled in Redis

## Cleanup

To destroy all resources:

```bash
# Staging
cdk destroy PaYaStackStaging

# Production
cdk destroy PaYaStackProduction
```

⚠️ **Warning**: This will delete all data including the database!

## Next Steps

1. Set up CI/CD pipeline (GitHub Actions)
2. Configure custom domain and SSL certificate
3. Set up monitoring and alerts
4. Configure auto-scaling
5. Set up backup strategies


