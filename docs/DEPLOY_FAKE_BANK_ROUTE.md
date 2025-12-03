# Deploying Fake Bank Account Route to Staging

## Problem

The route `POST /bank/fake/create` exists in the code but returns `404 Not Found` on staging because the code hasn't been deployed yet.

## Solution

You need to build and deploy the updated code to staging.

## Quick Deploy Steps

### Option 1: Use Deployment Script (Recommended)

```bash
cd M:/Projects/OpenPay/server
./scripts/deploy-to-aws.sh staging
```

This script will:
1. Build the TypeScript code
2. Build Docker image
3. Push to ECR
4. Update ECS service

### Option 2: Manual Deployment

#### 1. Build the Code

```bash
cd M:/Projects/OpenPay/server
pnpm build
```

#### 2. Build Docker Image

```bash
# Get ECR repository URI
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="789406174721.dkr.ecr.us-east-1.amazonaws.com/paya-staging"

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR_REPO

# Build image
docker build -t paya-staging:latest .

# Tag for ECR
docker tag paya-staging:latest $ECR_REPO:latest

# Push to ECR
docker push $ECR_REPO:latest
```

#### 3. Force ECS Service Update

```bash
# Get cluster and service names
CLUSTER_NAME="PaYaStackStaging-FargateCluster"
SERVICE_NAME="PaYaStackStaging-FargateService"

# Force new deployment (pulls latest image)
aws ecs update-service \
  --cluster $CLUSTER_NAME \
  --service $SERVICE_NAME \
  --force-new-deployment \
  --region us-east-1
```

#### 4. Wait for Deployment

```bash
# Watch deployment status
aws ecs describe-services \
  --cluster $CLUSTER_NAME \
  --services $SERVICE_NAME \
  --region us-east-1 \
  --query 'services[0].deployments[0].{status:status,runningCount:runningCount,desiredCount:desiredCount}'
```

## Verify Deployment

After deployment completes:

1. **Check ECS service is running new tasks**
2. **Test the route**:
   ```bash
   curl -X POST https://your-staging-url/bank/fake/create \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```

3. **Check application logs**:
   ```bash
   aws logs tail /ecs/paya-staging --follow
   ```

   Look for:
   - `[BankAccountService] Using FAKE service (staging/development mode)`
   - Route registration logs

## What Changed

The new code includes:
- ✅ `POST /bank/fake/create` route
- ✅ Fake bank account service implementation
- ✅ Environment variable handling for `BANK_SERVICE_MODE`

## Troubleshooting

### Route Still Not Found

1. **Check if code was built**: Verify `apps/api/dist/routes/bank.js` exists and contains the route
2. **Check Docker image**: Inspect the image to verify files are included
3. **Check ECS task logs**: Look for route registration errors
4. **Verify route prefix**: Ensure routes are registered with `/bank` prefix

### Service Won't Start

1. Check ECS task logs for errors
2. Verify environment variables are set correctly
3. Check if Prisma migrations are up to date

---

*Last Updated: December 2024*

