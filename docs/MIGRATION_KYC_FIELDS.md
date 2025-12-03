# KYC Fields Migration

## Overview

Added KYC (Know Your Customer) fields to the `users` table to support identity verification through Synctera.

## Migration Steps

### Option 1: Using Prisma (Recommended)

**First, update your local `.env` to use transaction mode:**
```bash
DATABASE_URL="postgresql://postgres.iodokznmskiendlffkwf:NKgBKAJE1CPvItfU@aws-1-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
```

Then run:
```bash
cd M:/Projects/OpenPay/server/apps/api
npx prisma db push
```

### Option 2: Manual SQL Migration

If Prisma doesn't work, run the SQL directly:

1. Connect to your Supabase database
2. Run the SQL from `prisma/migrations/add_kyc_fields.sql`:

```sql
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS address_line_1 VARCHAR(255),
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS state VARCHAR(50),
ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20),
ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON users(kyc_status);
```

### Option 3: Via Supabase Dashboard

1. Go to Supabase Dashboard → SQL Editor
2. Paste the SQL from `prisma/migrations/add_kyc_fields.sql`
3. Run it

## What Gets Added

All fields are **nullable** (optional) to preserve existing data:

- `first_name` - User's first name
- `last_name` - User's last name  
- `email` - User's email address
- `date_of_birth` - User's date of birth
- `address_line_1` - Street address
- `city` - City
- `state` - State (2-letter code)
- `postal_code` - ZIP/postal code
- `country_code` - Country (2-letter ISO code)

## Data Safety

✅ **All fields are nullable** - existing users won't be affected
✅ **No data loss** - only adds new columns
✅ **Can retrieve from Synctera** - if local data is missing, we fetch from Synctera

## After Migration

1. Regenerate Prisma Client:
   ```bash
   npx prisma generate
   ```

2. Verify the migration:
   ```sql
   SELECT column_name, data_type, is_nullable 
   FROM information_schema.columns 
   WHERE table_name = 'users' 
   AND column_name IN ('first_name', 'last_name', 'email', 'date_of_birth');
   ```

## Notes

- **SSN is NOT stored** - we only send `ssn_last_4` to Synctera during KYC submission
- **Synctera is source of truth** - we can retrieve full customer data from Synctera API
- **Local storage is optional** - for convenience/caching only

---

*Created: December 2024*

