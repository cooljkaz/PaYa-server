# Staging Environment Variables Verification

## Current Status

### ✅ NODE_ENV
- **CDK Stack**: Set to `environment` variable (which is `"staging"` for staging)
- **Task Definition**: Set to `"staging"` ✅
- **Status**: ✅ **CORRECT**

### ⚠️ BANK_SERVICE_MODE
- **CDK Stack**: ❌ **MISSING** (just added in code, needs deployment)
- **Task Definition**: ❌ **MISSING**
- **Status**: ⚠️ **NEEDS DEPLOYMENT**

## Current Behavior

Even without `BANK_SERVICE_MODE` explicitly set, the fake bank account service **should work** because:

1. `NODE_ENV=staging` is set correctly
2. The factory logic checks: `if (nodeEnv === 'staging' || nodeEnv === 'development')`
3. The fake service's `isAvailable()` returns `true` when `nodeEnv === 'staging'`

However, **explicitly setting `BANK_SERVICE_MODE=fake` is recommended** for:
- Clarity and maintainability
- Ensuring it works even if logic changes
- Making the intent explicit in the configuration

## What Was Changed

Added `BANK_SERVICE_MODE` to the CDK stack:

```typescript
environment: {
  NODE_ENV: environment,
  PORT: '3000',
  BANK_SERVICE_MODE: environment === 'production' ? 'real' : 'fake', // ✅ Added
  PLAID_ENV: environment === 'production' ? 'production' : 'sandbox',
  SYNCTERA_ENV: environment === 'production' ? 'production' : 'sandbox',
},
```

## Next Steps

1. **Deploy the CDK stack** to apply the change:
   ```bash
   cd infrastructure
   npm run cdk deploy PaYaStackStaging
   ```

2. **Verify after deployment**:
   - Check ECS task definition in AWS Console
   - Should see `BANK_SERVICE_MODE: fake` in environment variables
   - Check application logs for: `[BankAccountService] Using FAKE service (BANK_SERVICE_MODE=fake)`

3. **Test fake bank account creation**:
   - Try creating a fake bank account via mobile app
   - Should work without errors

## Expected Values After Deployment

### Staging Environment
- `NODE_ENV`: `"staging"` ✅
- `BANK_SERVICE_MODE`: `"fake"` ✅ (after deployment)

### Production Environment
- `NODE_ENV`: `"production"` ✅
- `BANK_SERVICE_MODE`: `"real"` ✅ (after deployment)

## Verification Commands

After deployment, verify in AWS Console:
1. ECS → Task Definitions → `PaYaStackStagingFargateServiceTaskDef...`
2. Check "Container Definitions" → "Environment" section
3. Should see both `NODE_ENV` and `BANK_SERVICE_MODE`

Or via AWS CLI:
```bash
aws ecs describe-task-definition \
  --task-definition PaYaStackStagingFargateServiceTaskDef3966E99E \
  --query 'taskDefinition.containerDefinitions[0].environment' \
  --output json
```

---

*Last Updated: December 2024*

