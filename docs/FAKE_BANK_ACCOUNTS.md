# Fake Bank Accounts for Alpha Testing

## Overview

During the alpha testing phase, users can create fake bank accounts that are instantly verified and work immediately for loading and redeeming money. This eliminates the need for:
- Plaid integration setup
- Real bank account linking
- Micro-deposit verification (3-5 day wait)
- Synctera account creation

## How It Works

### Creating a Fake Account

Users can create a fake bank account via the mobile app:

1. Navigate to **Link Bank Account**
2. Select **"Test Account (Alpha)"** option
3. Account is instantly created and verified

Or via API:

```bash
POST /bank/fake/create
Authorization: Bearer <token>

{
  "institutionName": "Test Bank",  // Optional
  "accountName": "Test Checking Account",  // Optional
  "accountType": "CHECKING"  // Optional: "CHECKING" or "SAVINGS"
}
```

### Account Details

Fake accounts have:
- **Routing Number**: `110000000` (fake)
- **Account Number**: Randomly generated 10-digit number
- **Status**: `verified` (instantly)
- **Metadata**: `{ isFake: true, createdFor: "alpha_testing" }`

### Load & Redeem Behavior

Fake accounts work exactly like real accounts, but:
- **Loads complete instantly** (no 3-5 day ACH wait)
- **Redeems complete instantly** (no 1-3 day ACH wait)
- No actual money moves (it's all simulated)

### Identifying Fake Accounts

Fake accounts are marked in:
- **Database**: `metadata.isFake = true`
- **API Response**: `isFake: true` field
- **Mobile UI**: "TEST" badge displayed

## Implementation Details

### Database Schema

The `BankAccount` model includes a `metadata` JSON field:

```prisma
model BankAccount {
  // ... other fields
  metadata Json @default("{}")
}
```

Fake accounts store:
```json
{
  "isFake": true,
  "createdFor": "alpha_testing",
  "fakeAccountNumber": "1234567890"
}
```

### API Endpoint

**POST `/bank/fake/create`**

Creates a fake bank account that is instantly verified.

**Request:**
```json
{
  "institutionName": "Test Bank",  // Optional
  "accountName": "Test Checking Account",  // Optional
  "accountType": "CHECKING"  // Optional: "CHECKING" or "SAVINGS"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "institutionName": "Test Bank",
    "accountName": "Test Checking Account",
    "accountMask": "7890",
    "accountType": "checking",
    "status": "verified",
    "isFake": true,
    "message": "Fake bank account created for testing..."
  }
}
```

### Load/Redeem Logic

When loading or redeeming with a fake account:

1. System checks `metadata.isFake === true`
2. Transaction status set to `completed` immediately
3. No ACH transfer initiated
4. Wallet balance updated instantly
5. User sees message: "Funds loaded instantly (test account)"

## Mobile UI

### Link Bank Screen

Users see three options:
1. **Instant Link** (Plaid) - Real bank account
2. **Manual Entry** - Real bank account with micro-deposits
3. **Test Account (Alpha)** - Fake account for testing ⭐

### Bank Accounts Screen

Fake accounts display:
- Institution name with "TEST" badge
- Normal account details
- Verified status
- Can be removed like real accounts

## Security Considerations

### Alpha Phase Only

This feature is intended for **alpha testing only**. Consider:

1. **Environment Check**: Could add `ALPHA_MODE=true` env var check
2. **User Limit**: Could restrict to specific test users
3. **Removal**: Plan to remove or disable before production

### Current Implementation

Currently, fake accounts work in all environments. To restrict:

```typescript
// In bank.ts
if (process.env.ALPHA_MODE !== 'true') {
  return reply.status(403).send({
    success: false,
    error: { code: 'FEATURE_DISABLED', message: 'Fake accounts only available in alpha mode' }
  });
}
```

## Testing

### Creating Test Accounts

```bash
# Via API
curl -X POST http://localhost:3000/bank/fake/create \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "institutionName": "Test Bank",
    "accountType": "CHECKING"
  }'
```

### Using Test Accounts

1. Create fake account
2. Load money → Should complete instantly
3. Send money to other users → Works normally
4. Redeem money → Should complete instantly

## Migration

To add the `metadata` field to existing `BankAccount` records:

```sql
-- Already handled by Prisma default value
-- Existing records will have metadata = {}
```

## Future Considerations

### Before Production

1. **Disable Endpoint**: Remove or restrict `/bank/fake/create`
2. **Mark Existing**: Identify and flag existing fake accounts
3. **User Communication**: Notify users with fake accounts
4. **Cleanup**: Optionally remove fake accounts or convert to real

### Alternative: Test Mode Flag

Could add a user-level flag:
```prisma
model User {
  isTestUser Boolean @default(false)
}
```

Then check: `if (user.isTestUser) { allow fake accounts }`

---

*Last Updated: December 2024*

