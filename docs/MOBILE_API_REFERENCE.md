# PaYa Mobile API Reference

**Base URL:** `http://localhost:3000` (development) | `https://api.paya.cash` (production)

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

PaYa uses **Plaid** for instant bank account linking and **Synctera** for ACH transfers.

### Bank Linking Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Option 1: Plaid Link (Recommended - Instant Verification)      │
│  ─────────────────────────────────────────────────────────────  │
│  1. Call POST /bank/link/create-token → get linkToken           │
│  2. Open Plaid Link SDK with linkToken                          │
│  3. User logs into their bank                                   │
│  4. Plaid returns publicToken + accountId                       │
│  5. Call POST /bank/link/exchange with publicToken              │
│  6. Account is INSTANTLY VERIFIED ✓                             │
│                                                                 │
│  Option 2: Manual Entry (Fallback - 3-5 days)                   │
│  ─────────────────────────────────────────────────────────────  │
│  1. Call POST /bank/link/manual with routing/account numbers    │
│  2. Synctera sends micro-deposits (3-5 business days)           │
│  3. User verifies amounts via POST /bank/verify-micro-deposits  │
│  4. Account is verified ✓                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

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

**Bank Account Status:**
- `pending` - Just created
- `verification_pending` - Awaiting micro-deposit verification
- `verified` - Ready for transfers
- `failed` - Verification failed
- `removed` - Deleted by user

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

**Mobile Integration:**
```typescript
// React Native with react-native-plaid-link-sdk
import { PlaidLink } from 'react-native-plaid-link-sdk';

// 1. Get link token from your API
const { linkToken } = await api.post('/bank/link/create-token');

// 2. Open Plaid Link
<PlaidLink
  tokenConfig={{ token: linkToken }}
  onSuccess={async (success) => {
    // 3. Exchange token with your API
    await api.post('/bank/link/exchange', {
      publicToken: success.publicToken,
      accountId: success.metadata.accounts[0].id,
    });
  }}
  onExit={(exit) => {
    console.log('User exited Plaid Link');
  }}
>
  <Text>Link Bank Account</Text>
</PlaidLink>
```

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
    "accountType": "checking",
    "status": "verified",
    "message": "Bank account linked successfully!"
  }
}
```

**Errors:**
- `BANK_LINK_FAILED` - Plaid exchange failed
- `VALIDATION_ERROR` - Invalid publicToken or accountId

---

### POST `/bank/link/manual` 🔒
Manually link a bank account (requires micro-deposit verification).

**Request:**
```json
{
  "accountOwnerName": "John Doe",
  "routingNumber": "021000021",
  "accountNumber": "123456789",
  "accountType": "CHECKING",
  "institutionName": "Chase"
}
```

**Validation:**
- `routingNumber`: Exactly 9 digits
- `accountNumber`: 4-17 digits
- `accountType`: `"CHECKING"` or `"SAVINGS"`

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "institutionName": "Chase",
    "accountMask": "6789",
    "status": "verification_pending",
    "message": "Bank account added. Please verify with micro-deposits (3-5 business days)."
  }
}
```

---

### POST `/bank/verify-micro-deposits` 🔒
Verify micro-deposit amounts to complete manual bank linking.

**Request:**
```json
{
  "bankAccountId": "uuid",
  "amounts": [32, 45]
}
```

**Note:** Amounts are in cents (e.g., `[32, 45]` = $0.32 and $0.45)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Bank account verified successfully"
  }
}
```

**Errors:**
- `NOT_FOUND` - Bank account not found or not pending
- `VERIFICATION_FAILED` - Incorrect amounts

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

**Status Flow:**
1. `pending` - ACH initiated
2. `processing` - Bank processing
3. `completed` - Funds available in wallet

**Errors:**
- `BANK_NOT_LINKED` - No verified bank account
- `WEEKLY_LIMIT_EXCEEDED` - Max 2,000 tokens/week
- `RATE_LIMIT_EXCEEDED` - New accounts limited to 100 tokens first week
- `TRANSFER_FAILED` - ACH initiation failed

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
- `TRANSFER_FAILED` - ACH initiation failed

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
| `BANK_LINK_FAILED` | 400 | Bank linking failed |
| `BANK_VERIFICATION_FAILED` | 400 | Bank verify failed |
| `VERIFICATION_FAILED` | 400 | Micro-deposit verification failed |
| `TRANSFER_FAILED` | 400 | ACH transfer failed |
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
- [ ] **Plaid Link SDK** - `react-native-plaid-link-sdk` for bank linking
- [ ] **Secure Storage** - `expo-secure-store` for tokens
- [ ] **Push Notifications** - FCM for payment alerts
- [ ] **Biometric Auth** - `expo-local-authentication` (optional)
- [ ] **QR Code** - `react-native-qrcode-svg` for receive screen
- [ ] **Haptics** - `expo-haptics` for feedback

### Key Screens

#### Onboarding Flow
1. **PhoneScreen** - Phone number entry
2. **OTPScreen** - 6-digit code verification
3. **UsernameScreen** - Choose username
4. **BankLinkScreen** - Link bank (optional, can skip)

#### Main App
5. **FeedScreen (Home)** - Balance, stats, public feed
6. **PayScreen** - Search user, enter amount, send
7. **ReceiveScreen** - QR code, share username
8. **ActivityScreen** - Transaction history
9. **ProfileScreen** - Settings, bank accounts, logout

#### Banking Screens
10. **BankAccountsScreen** - List linked accounts
11. **LinkBankScreen** - Plaid Link flow
12. **ManualLinkScreen** - Manual routing/account entry
13. **VerifyMicroDepositsScreen** - Enter deposit amounts
14. **LoadMoneyScreen** - Add funds from bank
15. **RedeemScreen** - Withdraw to bank

### Navigation Structure

```
RootNavigator
├── AuthNavigator (not authenticated)
│   ├── PhoneScreen
│   ├── OTPScreen
│   ├── UsernameScreen
│   └── BankLinkScreen (optional onboarding step)
│
└── MainNavigator (authenticated)
    ├── MainTabs
    │   ├── Feed (Home)
    │   ├── [Center Button] → Pay/Receive Modal
    │   └── Profile
    │
    └── Modal Screens
        ├── PayScreen
        ├── ReceiveScreen
        ├── ActivityScreen
        ├── BankAccountsScreen
        ├── LinkBankScreen
        ├── LoadMoneyScreen
        └── RedeemScreen
```

---

*API Version: MVP v1*
*Last Updated: November 2024*

