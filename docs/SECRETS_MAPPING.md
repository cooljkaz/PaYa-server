# Secrets Manager Key Mapping

## How It Works

Secrets Manager stores keys in **camelCase**, but your app reads them as **UPPER_SNAKE_CASE** environment variables.

The CDK stack automatically maps them:
- Secrets Manager key: `databaseUrl` → Environment variable: `DATABASE_URL`
- Secrets Manager key: `jwtAccessSecret` → Environment variable: `JWT_ACCESS_SECRET`

## Keys to Add in Secrets Manager

Add these keys to your `paya-staging-app-secrets` secret:

### Already Configured ✅
- `databaseUrl` → `DATABASE_URL`
- `jwtAccessSecret` → `JWT_ACCESS_SECRET`
- `jwtRefreshSecret` → `JWT_REFRESH_SECRET`
- `encryptionKey` → (auto-generated, keep as-is)

### Need to Add

**Redis:**
- `redisUrl` → `REDIS_URL`
  - Format: `redis://[endpoint]:6379`
  - Get after Redis is created: `aws elasticache describe-replication-groups --region us-east-1 --query 'ReplicationGroups[?contains(ReplicationGroupId, `paya-staging`)].PrimaryEndpoint.Address' --output text`

**Twilio (SMS):**
- `twilioAccountSid` → `TWILIO_ACCOUNT_SID`
- `twilioAuthToken` → `TWILIO_AUTH_TOKEN`
- `twilioPhoneNumber` → `TWILIO_PHONE_NUMBER`
  - Format: `+15551234567` (E.164 format)

**Plaid (Bank Linking):**
- `plaidClientId` → `PLAID_CLIENT_ID`
- `plaidSecret` → `PLAID_SECRET`
- `plaidEnv` → `PLAID_ENV` (optional - defaults to "sandbox")

**Synctera (BaaS):**
- `syncteraApi` → `SYNCTERA_API`
- `syncteraEnv` → `SYNCTERA_ENV` (optional - defaults to "sandbox")
- `syncteraWebhookSecret` → `SYNCTERA_WEBHOOK_SECRET`
- `syncteraAccountTemplateId` → `SYNCTERA_ACCOUNT_TEMPLATE_ID`

## Quick Reference Table

| Secrets Manager Key | Environment Variable | Required? | Notes |
|---------------------|----------------------|-----------|-------|
| `databaseUrl` | `DATABASE_URL` | ✅ Yes | Supabase connection string |
| `jwtAccessSecret` | `JWT_ACCESS_SECRET` | ✅ Yes | Already set |
| `jwtRefreshSecret` | `JWT_REFRESH_SECRET` | ✅ Yes | Already set |
| `redisUrl` | `REDIS_URL` | ✅ Yes | Add after Redis is created |
| `twilioAccountSid` | `TWILIO_ACCOUNT_SID` | ⚠️ Optional | For SMS OTP/invites |
| `twilioAuthToken` | `TWILIO_AUTH_TOKEN` | ⚠️ Optional | For SMS OTP/invites |
| `twilioPhoneNumber` | `TWILIO_PHONE_NUMBER` | ⚠️ Optional | For SMS OTP/invites |
| `plaidClientId` | `PLAID_CLIENT_ID` | ⚠️ Optional | For bank account linking |
| `plaidSecret` | `PLAID_SECRET` | ⚠️ Optional | For bank account linking |
| `syncteraApi` | `SYNCTERA_API` | ⚠️ Optional | For BaaS features |
| `syncteraWebhookSecret` | `SYNCTERA_WEBHOOK_SECRET` | ⚠️ Optional | For webhook verification |
| `syncteraAccountTemplateId` | `SYNCTERA_ACCOUNT_TEMPLATE_ID` | ⚠️ Optional | For account creation |

## How to Add

1. Go to AWS Secrets Manager Console
2. Open `paya-staging-app-secrets`
3. Click **"Retrieve secret value"** → **"Edit"**
4. Add the new keys to the JSON:
   ```json
   {
     "databaseUrl": "...",
     "jwtAccessSecret": "...",
     "jwtRefreshSecret": "...",
     "encryptionKey": "...",
     "redisUrl": "",
     "twilioAccountSid": "",
     "twilioAuthToken": "",
     "twilioPhoneNumber": "",
     "plaidClientId": "",
     "plaidSecret": "",
     "syncteraApi": "",
     "syncteraWebhookSecret": "",
     "syncteraAccountTemplateId": ""
   }
   ```
5. Fill in the values you have (leave empty strings for optional ones)
6. Click **"Save"**

## Notes

- **Empty strings are OK** - The app handles missing configs gracefully
- **Redis URL** - Add this after the stack deploys and Redis is created
- **Optional secrets** - Can be added later as you configure each service
- **Environment variables** - Automatically set from Secrets Manager by the CDK stack

