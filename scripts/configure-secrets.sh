#!/bin/bash
# Configure AWS Secrets Manager for PaYa staging environment
# This script updates all secrets defined in the CDK stack

set -e

REGION="us-east-1"
SECRET_NAME="paya-staging-app-secrets"

echo "🔐 Configuring Secrets Manager for PaYa Staging"
echo "================================================"
echo ""

# Get current secret value
echo "📥 Fetching current secret..."
CURRENT_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_NAME" \
  --region "$REGION" \
  --query 'SecretString' \
  --output text 2>/dev/null || echo '{}')

# Parse current values (with defaults)
DATABASE_URL=$(echo "$CURRENT_SECRET" | jq -r '.databaseUrl // "postgresql://user:password@host:5432/dbname?sslmode=require"')
JWT_ACCESS_SECRET=$(echo "$CURRENT_SECRET" | jq -r '.jwtAccessSecret // "placeholder"')
JWT_REFRESH_SECRET=$(echo "$CURRENT_SECRET" | jq -r '.jwtRefreshSecret // "placeholder"')
REDIS_URL=$(echo "$CURRENT_SECRET" | jq -r '.redisUrl // ""')
ENCRYPTION_KEY=$(echo "$CURRENT_SECRET" | jq -r '.encryptionKey // ""')
TWILIO_ACCOUNT_SID=$(echo "$CURRENT_SECRET" | jq -r '.twilioAccountSid // ""')
TWILIO_AUTH_TOKEN=$(echo "$CURRENT_SECRET" | jq -r '.twilioAuthToken // ""')
TWILIO_PHONE_NUMBER=$(echo "$CURRENT_SECRET" | jq -r '.twilioPhoneNumber // ""')
PLAID_CLIENT_ID=$(echo "$CURRENT_SECRET" | jq -r '.plaidClientId // ""')
PLAID_SECRET=$(echo "$CURRENT_SECRET" | jq -r '.plaidSecret // ""')
SYNCTERA_API=$(echo "$CURRENT_SECRET" | jq -r '.syncteraApi // ""')
SYNCTERA_WEBHOOK_SECRET=$(echo "$CURRENT_SECRET" | jq -r '.syncteraWebhookSecret // ""')
SYNCTERA_ACCOUNT_TEMPLATE_ID=$(echo "$CURRENT_SECRET" | jq -r '.syncteraAccountTemplateId // ""')

# Prompt for required values
echo ""
echo "Required values:"
echo ""

# Database URL
if [[ "$DATABASE_URL" == "postgresql://user:password@host:5432/dbname?sslmode=require" ]] || [[ "$DATABASE_URL" == "placeholder" ]]; then
  read -p "📊 Supabase DATABASE_URL: " DATABASE_URL
  if [[ -z "$DATABASE_URL" ]]; then
    echo "❌ DATABASE_URL is required!"
    exit 1
  fi
fi

# Generate JWT secrets if needed
if [[ "$JWT_ACCESS_SECRET" == "placeholder" ]]; then
  echo ""
  echo "🔑 Generating JWT secrets..."
  JWT_ACCESS_SECRET=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
  echo "   Generated JWT_ACCESS_SECRET"
fi

if [[ "$JWT_REFRESH_SECRET" == "placeholder" ]]; then
  JWT_REFRESH_SECRET=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
  echo "   Generated JWT_REFRESH_SECRET"
fi

# Optional values
echo ""
echo "Optional values (press Enter to skip):"
echo ""

# Redis URL
if [[ -z "$REDIS_URL" ]]; then
  read -p "🔴 Redis URL (e.g., redis://host:6379): " REDIS_URL
fi

# Twilio (optional)
if [[ -z "$TWILIO_ACCOUNT_SID" ]]; then
  read -p "📱 Twilio Account SID: " TWILIO_ACCOUNT_SID
fi

if [[ -z "$TWILIO_AUTH_TOKEN" ]]; then
  read -p "📱 Twilio Auth Token: " TWILIO_AUTH_TOKEN
fi

if [[ -z "$TWILIO_PHONE_NUMBER" ]]; then
  read -p "📱 Twilio Phone Number (E.164 format, e.g., +15551234567): " TWILIO_PHONE_NUMBER
fi

# Plaid (optional)
if [[ -z "$PLAID_CLIENT_ID" ]]; then
  read -p "🏦 Plaid Client ID: " PLAID_CLIENT_ID
fi

if [[ -z "$PLAID_SECRET" ]]; then
  read -p "🏦 Plaid Secret: " PLAID_SECRET
fi

# Synctera (optional)
if [[ -z "$SYNCTERA_API" ]]; then
  read -p "💳 Synctera API Key: " SYNCTERA_API
fi

if [[ -z "$SYNCTERA_WEBHOOK_SECRET" ]]; then
  read -p "💳 Synctera Webhook Secret: " SYNCTERA_WEBHOOK_SECRET
fi

if [[ -z "$SYNCTERA_ACCOUNT_TEMPLATE_ID" ]]; then
  read -p "💳 Synctera Account Template ID: " SYNCTERA_ACCOUNT_TEMPLATE_ID
fi

# Build new secret JSON
echo ""
echo "📝 Preparing secret update..."

SECRET_JSON=$(jq -n \
  --arg db "$DATABASE_URL" \
  --arg jwt_access "$JWT_ACCESS_SECRET" \
  --arg jwt_refresh "$JWT_REFRESH_SECRET" \
  --arg redis "$REDIS_URL" \
  --arg enc_key "$ENCRYPTION_KEY" \
  --arg twilio_sid "$TWILIO_ACCOUNT_SID" \
  --arg twilio_token "$TWILIO_AUTH_TOKEN" \
  --arg twilio_phone "$TWILIO_PHONE_NUMBER" \
  --arg plaid_id "$PLAID_CLIENT_ID" \
  --arg plaid_secret "$PLAID_SECRET" \
  --arg synctera_api "$SYNCTERA_API" \
  --arg synctera_webhook "$SYNCTERA_WEBHOOK_SECRET" \
  --arg synctera_template "$SYNCTERA_ACCOUNT_TEMPLATE_ID" \
  '{
    databaseUrl: $db,
    jwtAccessSecret: $jwt_access,
    jwtRefreshSecret: $jwt_refresh,
    redisUrl: ($redis // ""),
    encryptionKey: ($enc_key // ""),
    twilioAccountSid: ($twilio_sid // ""),
    twilioAuthToken: ($twilio_token // ""),
    twilioPhoneNumber: ($twilio_phone // ""),
    plaidClientId: ($plaid_id // ""),
    plaidSecret: ($plaid_secret // ""),
    syncteraApi: ($synctera_api // ""),
    syncteraWebhookSecret: ($synctera_webhook // ""),
    syncteraAccountTemplateId: ($synctera_template // "")
  }')

# Update secret
echo "💾 Updating secret in AWS Secrets Manager..."
aws secretsmanager update-secret \
  --secret-id "$SECRET_NAME" \
  --region "$REGION" \
  --secret-string "$SECRET_JSON" \
  > /dev/null

echo ""
echo "✅ Secret updated successfully!"
echo ""
echo "📋 Summary:"
echo "   ✅ DATABASE_URL: Updated"
echo "   ✅ JWT_ACCESS_SECRET: Generated/Updated"
echo "   ✅ JWT_REFRESH_SECRET: Generated/Updated"
if [[ -n "$REDIS_URL" ]]; then
  echo "   ✅ REDIS_URL: Updated"
else
  echo "   ⚠️  REDIS_URL: Not set (add after Redis is created)"
fi
if [[ -n "$TWILIO_ACCOUNT_SID" ]]; then
  echo "   ✅ Twilio: Configured"
else
  echo "   ⚠️  Twilio: Not configured (optional)"
fi
if [[ -n "$PLAID_CLIENT_ID" ]]; then
  echo "   ✅ Plaid: Configured"
else
  echo "   ⚠️  Plaid: Not configured (optional)"
fi
if [[ -n "$SYNCTERA_API" ]]; then
  echo "   ✅ Synctera: Configured"
else
  echo "   ⚠️  Synctera: Not configured (optional)"
fi
echo ""
if [[ "$JWT_ACCESS_SECRET" != "placeholder" ]] && [[ "$JWT_REFRESH_SECRET" != "placeholder" ]]; then
  echo "🔐 Keep your JWT secrets secure:"
  echo "   JWT_ACCESS_SECRET: $JWT_ACCESS_SECRET"
  echo "   JWT_REFRESH_SECRET: $JWT_REFRESH_SECRET"
  echo ""
fi

