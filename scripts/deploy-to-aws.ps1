# PaYa AWS Deployment Script (PowerShell)
# Usage: .\scripts\deploy-to-aws.ps1 [staging|production]

param(
    [Parameter(Position=0)]
    [ValidateSet("staging", "production")]
    [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

$StackName = "PaYaStack$($Environment.Substring(0,1).ToUpper() + $Environment.Substring(1))"
$Region = $env:AWS_REGION
if (-not $Region) { $Region = "us-east-1" }

Write-Host "🚀 Deploying PaYa API to AWS ($Environment)" -ForegroundColor Cyan

# Check prerequisites
$prereqs = @{
    "AWS CLI" = "aws"
    "Docker" = "docker"
    "AWS CDK" = "cdk"
}

foreach ($name in $prereqs.Keys) {
    $cmd = $prereqs[$name]
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Host "❌ Error: $name not installed" -ForegroundColor Red
        exit 1
    }
}

# Get AWS account
Write-Host "`nChecking AWS credentials..." -ForegroundColor Yellow
try {
    $AWSAccount = aws sts get-caller-identity --query Account --output text
    if (-not $AWSAccount) {
        Write-Host "❌ Error: AWS credentials not configured" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ AWS Account: $AWSAccount" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: AWS credentials not configured" -ForegroundColor Red
    exit 1
}

# Step 1: Deploy infrastructure
Write-Host "`nStep 1: Checking infrastructure..." -ForegroundColor Yellow
Push-Location infrastructure

try {
    aws cloudformation describe-stacks --stack-name $StackName --region $Region 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Infrastructure not found. Deploying..." -ForegroundColor Yellow
        pnpm install
        cdk bootstrap
        if ($Environment -eq "staging") {
            pnpm deploy:staging
        } else {
            pnpm deploy:production
        }
    } else {
        Write-Host "✓ Infrastructure already deployed" -ForegroundColor Green
    }
} finally {
    Pop-Location
}

# Step 2: Get ECR repository
Write-Host "`nStep 2: Getting ECR repository..." -ForegroundColor Yellow
$ECRRepo = aws cloudformation describe-stacks `
    --stack-name $StackName `
    --region $Region `
    --query "Stacks[0].Outputs[?OutputKey=='ECRRepositoryURI'].OutputValue" `
    --output text

if (-not $ECRRepo) {
    Write-Host "❌ Error: Could not find ECR repository" -ForegroundColor Red
    exit 1
}
Write-Host "✓ ECR Repository: $ECRRepo" -ForegroundColor Green

# Step 3: Build Docker image
Write-Host "`nStep 3: Building Docker image..." -ForegroundColor Yellow
docker build -t paya-api:latest -f Dockerfile .

# Step 4: Login to ECR
Write-Host "`nStep 4: Logging into ECR..." -ForegroundColor Yellow
$ecrPassword = aws ecr get-login-password --region $Region
$ecrPassword | docker login --username AWS --password-stdin $ECRRepo

# Step 5: Tag and push
Write-Host "`nStep 5: Pushing image to ECR..." -ForegroundColor Yellow
docker tag paya-api:latest "$ECRRepo`:latest"
docker push "$ECRRepo`:latest"
Write-Host "✓ Image pushed successfully" -ForegroundColor Green

# Step 6: Get cluster and service
Write-Host "`nStep 6: Updating ECS service..." -ForegroundColor Yellow
$ClusterName = aws cloudformation describe-stacks `
    --stack-name $StackName `
    --region $Region `
    --query "Stacks[0].Resources[?ResourceType=='AWS::ECS::Cluster'].PhysicalResourceId" `
    --output text

if (-not $ClusterName) {
    # Try alternative method
    $ClusterName = (aws ecs list-clusters --region $Region --query "clusterArns[?contains(@, 'PaYa')]" --output text | Select-Object -First 1) -replace ".*/", ""
}

$ServiceName = (aws ecs list-services --cluster $ClusterName --region $Region --query 'serviceArns[0]' --output text) -replace ".*/", ""

# Step 7: Force new deployment
Write-Host "`nStep 7: Triggering new deployment..." -ForegroundColor Yellow
aws ecs update-service `
    --cluster $ClusterName `
    --service $ServiceName `
    --region $Region `
    --force-new-deployment | Out-Null

Write-Host "✓ Deployment triggered" -ForegroundColor Green

# Step 8: Get load balancer URL
$LoadBalancerDNS = aws cloudformation describe-stacks `
    --stack-name $StackName `
    --region $Region `
    --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerDNS'].OutputValue" `
    --output text

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "✅ Deployment Complete!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "API URL: http://$LoadBalancerDNS" -ForegroundColor Cyan
Write-Host "`nMonitor deployment:" -ForegroundColor Yellow
Write-Host "  aws ecs describe-services --cluster $ClusterName --services $ServiceName --region $Region"
Write-Host "`nView logs:" -ForegroundColor Yellow
Write-Host "  aws logs tail /ecs/paya-$Environment --follow --region $Region"

