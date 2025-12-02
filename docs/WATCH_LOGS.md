# Watching ECS Fargate Logs

## Quick Start

### Option 1: PowerShell Scripts (Recommended for Windows)

**Real-time streaming (requires AWS CLI v2):**
```powershell
.\scripts\watch-logs.ps1
```

**With filter:**
```powershell
.\scripts\watch-logs.ps1 "JWT" "10m"
```

**Get recent logs:**
```powershell
.\scripts\get-recent-logs.ps1 10 "JWT"
```

### Option 2: AWS CLI Commands

**Real-time streaming (AWS CLI v2 only):**
```bash
aws logs tail /ecs/paya-staging --follow --since 10m
```

**With filter:**
```bash
aws logs tail /ecs/paya-staging --follow --filter-pattern "JWT" --format short
```

**Get recent logs (works with v1 and v2):**
```bash
# Last 10 minutes
aws logs filter-log-events \
  --log-group-name "/ecs/paya-staging" \
  --start-time $(($(date +%s) - 600))000 \
  --end-time $(date +%s)000 \
  --query 'events[*].message' \
  --output text
```

### Option 3: AWS CloudWatch Console (Web UI)

1. Go to: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups/log-group/%2Fecs%2Fpaya-staging
2. Click on the log stream (e.g., `paya-api/...`)
3. Use the filter/search box to filter logs

## Log Group Information

- **Staging**: `/ecs/paya-staging`
- **Production**: `/ecs/paya-production` (when deployed)
- **Stream Prefix**: `paya-api`
- **Retention**: 
  - Staging: 7 days
  - Production: 30 days

## Common Filter Patterns

- **JWT errors**: `"JWT"` or `"JWT verification failed"`
- **Authentication errors**: `"UNAUTHORIZED"` or `"Authentication failed"`
- **Database errors**: `"Prisma"` or `"database"`
- **API errors**: `"error"` or `"ERROR"`
- **Specific endpoint**: `"/payments/pending"` or `"/wallet/transactions"`

## Examples

**Watch for JWT errors in real-time:**
```powershell
.\scripts\watch-logs.ps1 "JWT verification failed"
```

**Get last 30 minutes of authentication errors:**
```powershell
.\scripts\get-recent-logs.ps1 30 "UNAUTHORIZED"
```

**Watch all logs:**
```powershell
.\scripts\watch-logs.ps1
```

## Troubleshooting

**If you get "log group not found":**
- The service might not have started yet
- Check that the ECS service is running: `aws ecs describe-services --cluster <cluster-name> --services <service-name>`

**If logs are empty:**
- The service might be healthy and not generating errors
- Try a longer time range
- Check that the log group exists: `aws logs describe-log-groups --log-group-name-prefix "/ecs/paya"`

**For AWS CLI v1 users:**
- Use `get-recent-logs.ps1` instead of `watch-logs.ps1`
- Or upgrade to AWS CLI v2 for real-time streaming: https://aws.amazon.com/cli/

