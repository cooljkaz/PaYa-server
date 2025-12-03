# Row-Level Security (RLS) Migration Guide

## Overview

This migration enables Row-Level Security (RLS) on the `public.users` table to prevent unauthorized access to user data. This addresses the security vulnerability identified by Supabase's security agent.

## What This Migration Does

1. **Enables RLS** on `public.users` table - blocks all access until policies are created
2. **Creates 5 security policies**:
   - Users can SELECT their own row
   - Users can UPDATE their own row
   - Users can INSERT their own row (during registration)
   - Users can DELETE their own row (if needed)
   - Authenticated users can search for other active users (for payment functionality)

## How to Apply

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open the file: `apps/api/prisma/migrations/enable_rls_users.sql`
4. Copy the entire SQL content
5. Paste into the SQL Editor
6. Click **Run** or press `Ctrl+Enter`

### Option 2: Via psql Command Line

```bash
# Connect to your Supabase database
psql "postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"

# Run the migration
\i apps/api/prisma/migrations/enable_rls_users.sql
```

### Option 3: Via Supabase CLI

```bash
# If you have Supabase CLI installed
supabase db push
# Or
supabase migration up
```

## Verification Steps

After applying the migration, verify it worked:

### 1. Check RLS is Enabled

```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'users';
```

Expected result: `rowsecurity = true`

### 2. List All Policies

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies 
WHERE tablename = 'users'
ORDER BY policyname;
```

Expected: You should see 5 policies:
- `users_select_own`
- `users_update_own`
- `users_insert_own`
- `users_delete_own`
- `users_search_authenticated`

### 3. Test as Authenticated User

In your application, test that:
- Users can read their own profile
- Users can update their own profile
- Users can search for other users by username
- Users **cannot** read other users' full profiles (except via search policy)

### 4. Test as Anonymous User

Anonymous users should have **no access** to the users table.

## Important Notes

### Data Type Handling

The `users.id` column is stored as `TEXT` but contains UUIDs. The policies use `id::uuid = auth.uid()` to properly compare with Supabase's `auth.uid()` which returns UUID.

### Search Functionality

The `users_search_authenticated` policy allows authenticated users to see **all columns** of active users. This is necessary for:
- Username search functionality
- Finding users to send payments to

If you have sensitive columns (like `phone_hash`, `email`, etc.) that shouldn't be exposed in search results, consider:
1. Creating a SECURITY DEFINER function that returns only safe columns
2. Using a database view with limited columns
3. Filtering sensitive fields in your application code

### Service Role Access

The `service_role` (used by your backend API) **automatically bypasses RLS**. This means:
- Your backend can still access all user data when needed
- RLS only applies to requests made through PostgREST (Supabase API)
- Direct database connections with service_role are not affected

## Next Steps

After applying this migration, consider:

1. **Enable RLS on other tables**:
   - `wallets` - users should only see their own wallet
   - `transactions` - users should only see their own transactions
   - `bank_accounts` - users should only see their own bank accounts
   - `sessions` - users should only see their own sessions

2. **Test thoroughly**:
   - Test user registration (INSERT)
   - Test profile updates (UPDATE)
   - Test user search functionality
   - Test payment flows

3. **Monitor logs**:
   - Watch for any RLS policy violations
   - Check Supabase logs for denied requests
   - Adjust policies if legitimate requests are being blocked

## Rollback (If Needed)

If you need to rollback this migration:

```sql
-- Disable RLS (NOT RECOMMENDED - security risk)
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Or drop all policies
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_insert_own" ON public.users;
DROP POLICY IF EXISTS "users_delete_own" ON public.users;
DROP POLICY IF EXISTS "users_search_authenticated" ON public.users;
```

**Warning**: Disabling RLS will expose all user data. Only do this if absolutely necessary and re-enable immediately.

## Support

If you encounter issues:
1. Check Supabase logs for policy violation errors
2. Verify your JWT tokens include the correct `sub` claim
3. Ensure `auth.uid()` returns the correct UUID format
4. Test with different user roles (anon, authenticated, service_role)

