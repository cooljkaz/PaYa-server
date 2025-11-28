# PaYa Mobile API Reference

**Base URL:** `http://localhost:3000` (development) | `https://api.paya.app` (production)

---

## Table of Contents

1. [Authentication](#authentication)
2. [User Endpoints](#user-endpoints)
3. [Wallet Endpoints](#wallet-endpoints)
4. [Payment Endpoints](#payment-endpoints)
5. [Banking Endpoints](#banking-endpoints)
6. [Feed Endpoints](#feed-endpoints)
7. [WebSocket Real-Time Feed](#websocket-real-time-feed)
8. [Error Handling](#error-handling)
9. [Rate Limits](#rate-limits)
10. [Types & Schemas](#types--schemas)

---

## Authentication

All authenticated endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

### Token Lifecycle
- **Access Token:** Expires in 15 minutes
- **Refresh Token:** Expires in 7 days
- Store tokens securely (Keychain on iOS, EncryptedSharedPreferences on Android)

---

### POST `/auth/request-otp`
Request an SMS OTP code.

**Request:**
```json
{
  "phone": "+11234567890"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "OTP sent",
    "expiresIn": 300
  }
}
```

**Errors:**
- `INVALID_PHONE` - Invalid phone format (must be +1XXXXXXXXXX)
- `RATE_LIMIT_EXCEEDED` - Too many OTP requests

---

### POST `/auth/register`
Create a new account after receiving OTP.

**Request:**
```json
{
  "phone": "+11234567890",
  "otp": "123456",
  "username": "myusername",
  "deviceId": "device-uuid",
  "deviceName": "iPhone 15 Pro",
  "devicePlatform": "ios"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "myusername",
      "phoneLastFour": "7890"
    },
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG...",
    "expiresAt": "2024-01-01T12:15:00Z"
  }
}
```

**Validation:**
- `phone`: US phone number format `+1XXXXXXXXXX`
- `otp`: 6 digits
- `username`: 3-30 chars, lowercase letters/numbers/underscores only
- `devicePlatform`: `"ios"` | `"android"` | `"web"`

**Errors:**
- `INVALID_OTP` - Wrong OTP code
- `OTP_EXPIRED` - OTP expired (5 min limit)
- `USERNAME_TAKEN` - Username already exists
- `INVALID_USERNAME` - Invalid username format

---

### POST `/auth/verify-otp`
Login existing user with OTP.

**Request:**
```json
{
  "phone": "+11234567890",
  "otp": "123456",
  "deviceId": "device-uuid",
  "deviceName": "iPhone 15 Pro",
  "devicePlatform": "ios"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "alice",
      "phoneLastFour": "7890"
    },
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG...",
    "expiresAt": "2024-01-01T12:15:00Z"
  }
}
```

---

### POST `/auth/refresh`
Refresh access token using refresh token.

**Request:**
```json
{
  "refreshToken": "eyJhbG..."
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG...",
    "expiresAt": "2024-01-01T12:15:00Z"
  }
}
```

---

### POST `/auth/logout`
Revoke current session.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Logged out successfully"
  }
}
```

---

## User Endpoints

### GET `/users/me` 🔒
Get current user's profile.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "alice",
    "phoneLastFour": "7890",
    "status": "active",
    "flags": [],
    "createdAt": "2024-01-01T00:00:00Z",
    "lastActiveAt": "2024-01-15T10:30:00Z"
  }
}
```

---

### GET `/users/:username`
Get public profile of any user.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "bob"
  }
}
```

**Errors:**
- `USER_NOT_FOUND` - Username doesn't exist

---

### GET `/users/search?q=` 🔒
Search users by username prefix.

**Query Params:**
- `q` (required): Search query (min 2 chars)

**Response (200):**
```json
{
  "success": true,
  "data": [
    { "id": "uuid1", "username": "bob" },
    { "id": "uuid2", "username": "bobby" }
  ]
}
```

---

## Wallet Endpoints

### GET `/wallet` 🔒
Get current user's wallet balance and stats.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "balance": 1000,
    "totalLoaded": 1500,
    "totalSent": 300,
    "totalReceived": 200,
    "totalRedeemed": 400,
    "totalRewards": 0
  }
}
```

---

### GET `/wallet/transactions` 🔒
Get transaction history with pagination.

**Query Params:**
- `page`: Page number (default: 1)
- `pageSize`: Items per page (default: 20, max: 100)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "type": "payment",
        "status": "completed",
        "fromUserId": "uuid",
        "toUserId": "uuid",
        "fromUsername": "alice",
        "toUsername": "bob",
        "amount": 50,
        "feeAmount": 0,
        "memo": "Coffee ☕",
        "isPublic": true,
        "createdAt": "2024-01-15T10:30:00Z",
        "completedAt": "2024-01-15T10:30:00Z"
      }
    ],
    "total": 25,
    "page": 1,
    "pageSize": 20,
    "hasMore": true
  }
}
```

**Transaction Types:**
- `load` - Bank → Wallet
- `payment` - User → User transfer
- `redemption` - Wallet → Bank
- `reward` - Weekly reward distribution
- `fee` - Fee charges

**Transaction Status:**
- `pending` - Initiated, awaiting processing
- `processing` - In progress
- `completed` - Successfully completed
- `failed` - Failed
- `cancelled` - Cancelled

---

### GET `/wallet/transactions/:id` 🔒
Get single transaction details.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "type": "payment",
    "status": "completed",
    "fromUserId": "uuid",
    "toUserId": "uuid",
    "fromUsername": "alice",
    "toUsername": "bob",
    "amount": 50,
    "feeAmount": 0,
    "memo": "Coffee ☕",
    "isPublic": true,
    "createdAt": "2024-01-15T10:30:00Z",
    "completedAt": "2024-01-15T10:30:00Z"
  }
}
```

---

## Payment Endpoints

### POST `/payments/send` 🔒
Send tokens to another user.

**Request:**
```json
{
  "toUsername": "bob",
  "amount": 50,
  "memo": "Coffee ☕",
  "isPublic": true,
  "idempotencyKey": "uuid-optional"
}
```

**Validation:**
- `toUsername`: Valid username (3-30 chars)
- `amount`: 1-10,000 (whole numbers only)
- `memo`: Max 280 characters (optional)
- `isPublic`: Boolean, default `true` (shows in public feed)
- `idempotencyKey`: UUID (optional, prevents duplicate sends)

**Response (201):**
```json
{
  "success": true,
  "data": {
    "transaction": {
      "id": "uuid",
      "type": "payment",
      "status": "completed",
      "amount": 50,
      "toUsername": "bob",
      "memo": "Coffee ☕",
      "createdAt": "2024-01-15T10:30:00Z"
    },
    "newBalance": 950
  }
}
```

**Errors:**
- `USER_NOT_FOUND` - Recipient doesn't exist
- `INSUFFICIENT_BALANCE` - Not enough tokens
- `SELF_TRANSFER` - Can't send to yourself
- `INVALID_AMOUNT` - Amount validation failed
- `RATE_LIMIT_EXCEEDED` - Too many sends
- `ACCOUNT_FROZEN` - Your account is frozen

---

## Banking Endpoints

### GET `/bank/accounts` 🔒
List linked bank accounts.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "institutionName": "Chase",
      "accountName": "Checking",
      "accountMask": "1234",
      "accountType": "checking",
      "status": "verified",
      "verifiedAt": "2024-01-10T00:00:00Z",
      "createdAt": "2024-01-10T00:00:00Z"
    }
  ]
}
```

---

### POST `/bank/link/create-token` 🔒
Get Plaid Link token to connect a bank account.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "linkToken": "link-sandbox-xxxx",
    "expiration": "2024-01-15T11:00:00Z"
  }
}
```

**Usage:** Pass this token to Plaid Link SDK in your mobile app.

---

### POST `/bank/link/exchange` 🔒
Exchange Plaid public token after user completes Link flow.

**Request:**
```json
{
  "publicToken": "public-sandbox-xxxx",
  "accountId": "account-id-from-plaid"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "institutionName": "Chase",
    "accountMask": "1234",
    "status": "verified"
  }
}
```

---

### POST `/bank/load` 🔒
Load money from bank to wallet (ACH pull).

**Request:**
```json
{
  "amount": 100,
  "idempotencyKey": "uuid-optional"
}
```

**Validation:**
- `amount`: 1-10,000 (whole numbers, in tokens/dollars)

**Response (201):**
```json
{
  "success": true,
  "data": {
    "transaction": {
      "id": "uuid",
      "type": "load",
      "status": "pending",
      "amount": 100,
      "createdAt": "2024-01-15T10:30:00Z"
    },
    "newBalance": 1100,
    "message": "Load initiated. Funds will be available in 3-5 business days."
  }
}
```

**Errors:**
- `BANK_NOT_LINKED` - No verified bank account
- `WEEKLY_LIMIT_EXCEEDED` - Max 2,000 tokens/week
- `RATE_LIMIT_EXCEEDED` - New accounts limited to 100 tokens first week

---

### POST `/bank/redeem` 🔒
Redeem tokens to bank (ACH push).

**Request:**
```json
{
  "amount": 100,
  "idempotencyKey": "uuid-optional"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "transaction": {
      "id": "uuid",
      "type": "redemption",
      "status": "pending",
      "amount": 100,
      "feeAmount": 0,
      "createdAt": "2024-01-15T10:30:00Z"
    },
    "newBalance": 900,
    "message": "Redemption initiated. Funds will arrive in 1-3 business days."
  }
}
```

**Fees:**
- First 100 tokens/week: **FREE**
- Above 100 tokens/week: **$3.00 flat fee**

**Errors:**
- `BANK_NOT_LINKED` - No verified bank account
- `INSUFFICIENT_BALANCE` - Not enough tokens
- `RATE_LIMIT_EXCEEDED` - New accounts can't redeem for 14 days

---

### DELETE `/bank/accounts/:id` 🔒
Remove a linked bank account.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Bank account removed"
  }
}
```

---

## Feed Endpoints

### GET `/feed`
Public payment feed (no auth required).

**Query Params:**
- `page`: Page number (default: 1)
- `pageSize`: Items per page (default: 20, max: 100)
- `before`: ISO timestamp for cursor pagination

**Response (200):**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "fromUsername": "alice",
        "toUsername": "bob",
        "amount": 50,
        "memo": "Coffee ☕",
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ],
    "total": 150,
    "page": 1,
    "pageSize": 20,
    "hasMore": true
  }
}
```

---

## WebSocket Real-Time Feed

### Connect to `/feed/live`

**URL:** `ws://localhost:3000/feed/live`

**Connection:**
```javascript
const ws = new WebSocket('ws://localhost:3000/feed/live');

ws.onopen = () => {
  console.log('Connected to live feed');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('New payment:', data);
};
```

**Message Format:**
```json
{
  "type": "payment",
  "data": {
    "id": "uuid",
    "fromUsername": "alice",
    "toUsername": "bob",
    "amount": 50,
    "memo": "Coffee ☕",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

---

## Transparency Dashboard

### GET `/transparency`
Public transparency data (no auth required).

**Response (200):**
```json
{
  "success": true,
  "data": {
    "reserveUsdCents": 500000,
    "totalTokensInCirculation": 5000,
    "backingRatio": 1.0,
    "lastWeekRevenue": 15000,
    "lastWeekOpsAllocation": 1500,
    "lastWeekUserPool": 13500,
    "lastWeekActiveUsers": 100,
    "lastWeekPerUserReward": 135,
    "updatedAt": "2024-01-15T00:00:00Z"
  }
}
```

---

## Error Handling

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

### Error Codes Reference

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_PHONE` | 400 | Invalid phone format |
| `INVALID_OTP` | 400 | Wrong OTP code |
| `OTP_EXPIRED` | 400 | OTP expired (5 min) |
| `SESSION_EXPIRED` | 401 | Token expired |
| `UNAUTHORIZED` | 401 | Not authenticated |
| `USERNAME_TAKEN` | 409 | Username exists |
| `INVALID_USERNAME` | 400 | Invalid format |
| `USER_NOT_FOUND` | 404 | User doesn't exist |
| `ACCOUNT_FROZEN` | 403 | Account frozen |
| `INSUFFICIENT_BALANCE` | 400 | Not enough tokens |
| `INVALID_AMOUNT` | 400 | Invalid transfer amount |
| `SELF_TRANSFER` | 400 | Can't send to yourself |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `DAILY_LIMIT_EXCEEDED` | 429 | Daily limit hit |
| `WEEKLY_LIMIT_EXCEEDED` | 429 | Weekly limit hit |
| `BANK_NOT_LINKED` | 400 | No bank connected |
| `BANK_VERIFICATION_FAILED` | 400 | Bank verify failed |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `INTERNAL_ERROR` | 500 | Server error |
| `NOT_FOUND` | 404 | Resource not found |

---

## Rate Limits

| Limit | Value | Window |
|-------|-------|--------|
| API requests | 100 | per minute |
| Send payments | 10 | per hour |
| Send payments | 50 | per day |
| Unique recipients | 20 | per day |
| Load from bank | 2,000 tokens | per week |

### New Account Restrictions

| Restriction | Duration |
|-------------|----------|
| Can't redeem | First 14 days |
| Max load | 100 tokens | First 7 days |
| No rewards | First 7 days |

---

## Types & Schemas

### User Status
```typescript
type UserStatus = 'active' | 'frozen' | 'suspended' | 'deleted';
```

### Transaction Type
```typescript
type TransactionType = 'load' | 'payment' | 'redemption' | 'reward' | 'fee' | 'adjustment';
```

### Transaction Status
```typescript
type TransactionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
```

### Bank Account Status
```typescript
type BankAccountStatus = 'pending' | 'verified' | 'failed' | 'removed';
```

### Device Platform
```typescript
type DevicePlatform = 'ios' | 'android' | 'web';
```

---

## Development Test Users

| Username | Phone | Initial Balance |
|----------|-------|-----------------|
| alice | +11234567890 | 1000 tokens |
| bob | +10987654321 | 500 tokens |
| charlie | +11111111111 | 250 tokens |
| diana | +12222222222 | 100 tokens |

### Dev-Only Endpoints (Development Mode)

These endpoints bypass auth for testing:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dev/stats` | API statistics |
| GET | `/dev/users` | List all users with balances |
| POST | `/dev/login/:username` | Get JWT for any user |
| GET | `/dev/transactions` | Recent transactions |
| POST | `/dev/mint/:username` | Add tokens to user |

**Example - Get token for alice:**
```bash
curl -X POST http://localhost:3000/dev/login/alice
```

---

## Mobile App Checklist

### Required Integrations
- [ ] Plaid Link SDK (for bank account linking)
- [ ] Secure token storage (Keychain / EncryptedSharedPreferences)
- [ ] Push notifications (for payment received alerts)
- [ ] Biometric auth (optional, for app unlock)

### Key Screens
1. **Onboarding** - Phone entry → OTP → Username selection
2. **Home** - Balance, recent activity, quick send
3. **Send** - Username search, amount, memo
4. **Activity** - Transaction history
5. **Public Feed** - Live payment stream
6. **Bank** - Link account, load/redeem
7. **Profile** - Settings, linked accounts
8. **Transparency** - Reserve data, weekly rewards

---

*API Version: MVP v1*
*Last Updated: November 2024*

