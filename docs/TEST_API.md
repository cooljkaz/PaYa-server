# Testing PaYa API (Staging)

## API URL
```
http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com
```

## Quick Test Commands

### 1. Health Check
```bash
curl http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com/health
```

### 2. Root Endpoint
```bash
curl http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com/
```

### 3. Public Endpoints (No Auth Required)

#### Transparency Data
```bash
curl http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com/transparency
```

#### Public Feed
```bash
curl http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com/feed
```

### 4. Authentication Flow

#### Request OTP
```bash
curl -X POST http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+15551234567"}'
```

#### Verify OTP & Login
```bash
curl -X POST http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+15551234567",
    "otp": "123456",
    "deviceId": "test-device",
    "deviceName": "Test Device",
    "devicePlatform": "web"
  }'
```

**Save the `accessToken` and `refreshToken` from the response!**

#### Get Current User (Requires Auth)
```bash
curl http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com/users/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 5. Wallet Endpoints (Requires Auth)

#### Get Wallet
```bash
curl http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com/wallet \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### Get Transactions
```bash
curl http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com/wallet/transactions \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 6. Payment Endpoints (Requires Auth)

#### Send Payment
```bash
curl -X POST http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com/payments/send \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "toUsername": "recipient",
    "amount": 1000,
    "memo": "Test payment"
  }'
```

### 7. Dev Endpoints (No Auth - Development Only)

#### List Users
```bash
curl http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com/dev/users
```

#### Get Stats
```bash
curl http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com/dev/stats
```

#### Get OTP (Dev - bypasses SMS)
```bash
curl http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com/dev/otp/+15551234567
```

#### Login as User (Dev)
```bash
curl -X POST http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com/dev/login/testuser
```

## Using Postman or Insomnia

1. **Base URL:** `http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com`

2. **For authenticated requests:**
   - Add header: `Authorization: Bearer YOUR_ACCESS_TOKEN`
   - Get token from `/auth/verify-otp` response

3. **Collection Structure:**
   - `GET /health` - Health check
   - `GET /` - API info
   - `GET /transparency` - Public transparency data
   - `GET /feed` - Public payment feed
   - `POST /auth/request-otp` - Request OTP
   - `POST /auth/verify-otp` - Login
   - `GET /users/me` - Get current user (auth)
   - `GET /wallet` - Get wallet (auth)
   - `GET /wallet/transactions` - Get transactions (auth)
   - `POST /payments/send` - Send payment (auth)

## Current Issue

⚠️ **Database Connection Error:** The API can't reach Supabase PostgreSQL.

**Possible causes:**
1. Supabase firewall blocking AWS IPs
2. DATABASE_URL secret not set correctly
3. Network connectivity issue from VPC

**To fix:**
1. Check Supabase dashboard → Settings → Database → Connection Pooling
2. Ensure Supabase allows connections from AWS IP ranges
3. Verify DATABASE_URL in Secrets Manager includes `?sslmode=require`

## Testing from Mobile App

Update your mobile app's API URL to:
```
http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com
```

Or use the environment variable in your app config.




