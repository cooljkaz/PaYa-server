#!/bin/bash

# PaYa AWS Deployment Script
# Usage: ./scripts/deploy-to-aws.sh [staging|production]

set -e

ENVIRONMENT=${1:-staging}
STACK_NAME="PaYaStack${ENVIRONMENT^}"  # Capitalize first letter
REGION=${AWS_REGION:-us-east-1}

echo "🚀 Deploying PaYa API to AWS ($ENVIRONMENT)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
command -v aws >/dev/null 2>&1 || { echo -e "${RED}Error: AWS CLI not installed${NC}" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo -e "${RED}Error: Docker not installed${NC}" >&2; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo -e "${RED}Error: pnpm not installed${NC}" >&2; exit 1; }

# Get AWS account info
echo -e "${YELLOW}Checking AWS credentials...${NC}"
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
if [ -z "$AWS_ACCOUNT" ]; then
  echo -e "${RED}Error: AWS credentials not configured${NC}"
  exit 1
fi
echo -e "${GREEN}✓ AWS Account: $AWS_ACCOUNT${NC}"

# Step 1: Deploy infrastructure (if not already deployed)
echo -e "\n${YELLOW}Step 1: Checking infrastructure...${NC}"
cd infrastructure
if ! aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" >/dev/null 2>&1; then
  echo "Infrastructure not found. Deploying..."
  pnpm install
  pnpm cdk bootstrap
  if [ "$ENVIRONMENT" = "staging" ]; then
    pnpm deploy:staging
  else
    pnpm deploy:production
  fi
else
  echo -e "${GREEN}✓ Infrastructure already deployed${NC}"
fi

# Step 2: Get ECR repository URI
echo -e "\n${YELLOW}Step 2: Getting ECR repository...${NC}"
ECR_REPO=$(aws ecr describe-repositories \
  --region "$REGION" \
  --repository-names "paya-${ENVIRONMENT}" \
  --query 'repositories[0].repositoryUri' \
  --output text)

if [ -z "$ECR_REPO" ]; then
  echo -e "${RED}Error: Could not find ECR repository paya-${ENVIRONMENT}${NC}"
  echo -e "${YELLOW}Create it with: aws ecr create-repository --repository-name paya-${ENVIRONMENT} --region ${REGION}${NC}"
  exit 1
fi
echo -e "${GREEN}✓ ECR Repository: $ECR_REPO${NC}"

# Step 3: Build Docker image
echo -e "\n${YELLOW}Step 3: Building Docker image...${NC}"
cd ..
docker build -t paya-api:latest -f Dockerfile .

# Step 4: Login to ECR
echo -e "\n${YELLOW}Step 4: Logging into ECR...${NC}"
aws ecr get-login-password --region "$REGION" | \
  docker login --username AWS --password-stdin "$ECR_REPO"

# Step 5: Tag and push image
echo -e "\n${YELLOW}Step 5: Pushing image to ECR...${NC}"
docker tag paya-api:latest "$ECR_REPO:latest"
docker push "$ECR_REPO:latest"
echo -e "${GREEN}✓ Image pushed successfully${NC}"

# Step 6: Get cluster and service names
echo -e "\n${YELLOW}Step 6: Updating ECS service...${NC}"
# Get cluster ARN from ECS (not CloudFormation outputs)
# Search for cluster containing the stack name
CLUSTER_ARN=$(aws ecs list-clusters \
  --region "$REGION" \
  --query "clusterArns[?contains(@, '$STACK_NAME')]" \
  --output text | head -1)

if [ -z "$CLUSTER_ARN" ]; then
  echo -e "${RED}Error: Could not find ECS cluster${NC}"
  exit 1
fi

CLUSTER_NAME=$(echo "$CLUSTER_ARN" | awk -F'/' '{print $NF}')
echo -e "${GREEN}✓ Cluster: $CLUSTER_NAME${NC}"

SERVICE_NAME=$(aws ecs list-services \
  --cluster "$CLUSTER_NAME" \
  --region "$REGION" \
  --query 'serviceArns[0]' \
  --output text | awk -F'/' '{print $NF}')

if [ -z "$SERVICE_NAME" ]; then
  echo -e "${RED}Error: Could not find ECS service${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Service: $SERVICE_NAME${NC}"

# Step 7: Force new deployment
echo -e "\n${YELLOW}Step 7: Triggering new deployment...${NC}"
aws ecs update-service \
  --cluster "$CLUSTER_NAME" \
  --service "$SERVICE_NAME" \
  --region "$REGION" \
  --force-new-deployment > /dev/null

echo -e "${GREEN}✓ Deployment triggered${NC}"

# Step 8: Get load balancer URL
LOAD_BALANCER_DNS=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerDNS'].OutputValue" \
  --output text)

echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "API URL: ${GREEN}http://$LOAD_BALANCER_DNS${NC}"
echo -e "\nMonitor deployment:"
echo -e "  aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --region $REGION"
echo -e "\nView logs:"
echo -e "  aws logs tail /ecs/paya-$ENVIRONMENT --follow --region $REGION"

