# Bank Account Metadata Migration

## Overview

Added `metadata` JSON field to `BankAccount` model to support fake account tracking for alpha testing.

## Migration Steps

### 1. Run Prisma Migration

The schema already has `metadata Json @default("{}")`, so when you run the migration, Prisma will:

1. Add the `metadata` column to `bank_accounts` table
2. Set default value to `{}` for new records
3. Set existing records to `{}` automatically

```bash
cd M:/Projects/OpenPay/server/apps/api
npx prisma migrate dev --name add_bank_account_metadata
```

### 2. Backfill Existing Records (Optional but Recommended)

Even though Prisma should handle this automatically, run the backfill script to ensure all existing records have the metadata field:

```bash
cd M:/Projects/OpenPay/server/apps/api
npx tsx scripts/backfill-bank-account-metadata.ts
```

Or if using pnpm:

```bash
pnpm tsx scripts/backfill-bank-account-metadata.ts
```

### 3. Verify Migration

Check that all bank accounts have metadata:

```sql
-- Check for any accounts with null metadata
SELECT COUNT(*) FROM bank_accounts WHERE metadata IS NULL;

-- Should return 0
```

## What Gets Backfilled

- **All existing bank accounts get `metadata = { isFake: true, ... }`**
- Since all accounts in the database are test accounts, they're marked as fake
- This allows them to work with the fake bank account service (instant loads/redeems)
- New fake accounts will also have `metadata = { isFake: true, ... }`

## Rollback

If you need to rollback:

```sql
ALTER TABLE bank_accounts DROP COLUMN metadata;
```

**Note:** This will lose any metadata stored in fake accounts. Only do this if you're sure you want to remove the feature.

## Testing

After migration:

1. Create a new fake bank account
2. Check that it has `metadata.isFake === true`
3. Create a real bank account (via Plaid/manual)
4. Check that it has `metadata = {}` (or no isFake flag)

---

*Created: December 2024*

