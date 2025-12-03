# Row-Level Security (RLS) Migration Guide - All Tables

## Overview

This migration enables Row-Level Security (RLS) on **all 12 tables** exposed to PostgREST in the `public` schema. This addresses security vulnerabilities identified by Supabase's security agent.

## Tables Covered

### User-Owned Tables (Users can access their own data)
1. ✅ **users** - User profiles (see `enable_rls_users.sql` for details)
2. ✅ **wallets** - User wallet balances
3. ✅ **transactions** - Payment transactions (own + public feed)
4. ✅ **sessions** - User authentication sessions
5. ✅ **bank_accounts** - User bank account information
6. ✅ **pending_payments** - Payments sent to non-users
7. ✅ **weekly_activity** - User weekly activity tracking
8. ✅ **rate_limit_counters** - Rate limiting counters
9. ✅ **ledger_entries** - Wallet ledger entries (read-only for users)

### System/Admin Tables (Read-only or restricted)
10. ✅ **weekly_cycles** - Weekly reward cycles (read-only for users)
11. ✅ **reserve_snapshots** - Reserve balance snapshots (read-only for users)
12. ✅ **audit_logs** - System audit logs (users see their own)

## How to Apply

### Step 1: Apply Users Table RLS (if not already done)

If you haven't already applied RLS to the `users` table:

```sql
-- Run: enable_rls_users.sql
```

### Step 2: Apply RLS to All Other Tables

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open the file: `apps/api/prisma/migrations/enable_rls_all_tables.sql`
4. Copy the entire SQL content
5. Paste into the SQL Editor
6. Click **Run** or press `Ctrl+Enter`

### Alternative: Apply via Command Line

```bash
# Connect to your Supabase database
psql "postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"

# Run the migration
\i apps/api/prisma/migrations/enable_rls_all_tables.sql
```

## Policy Summary

### User-Owned Tables

| Table | SELECT | INSERT | UPDATE | DELETE | Notes |
|-------|--------|--------|--------|--------|-------|
| **wallets** | Own only | Own only | Own only | ❌ | Balance changes via transactions |
| **transactions** | Own + public feed | Own only | Own only | ❌ | Public feed for completed payments |
| **sessions** | Own only | Own only | Own only | Own only | Full CRUD for own sessions |
| **bank_accounts** | Own only | Own only | Own only | Own only | Full CRUD for own accounts |
| **pending_payments** | Sent/claimed | Sent only | Claimed only | ❌ | Can't delete pending payments |
| **weekly_activity** | Own + public eligible | ❌ | ❌ | ❌ | Read-only, system managed |
| **rate_limit_counters** | Own only | Own only | Own only | ❌ | System managed in practice |
| **ledger_entries** | Own wallet only | ❌ | ❌ | ❌ | Read-only, system managed |

### System Tables

| Table | SELECT | INSERT | UPDATE | DELETE | Notes |
|-------|--------|--------|--------|--------|-------|
| **weekly_cycles** | All authenticated | ❌ | ❌ | ❌ | Read-only for transparency |
| **reserve_snapshots** | All authenticated | ❌ | ❌ | ❌ | Read-only for transparency |
| **audit_logs** | Own records only | ❌ | ❌ | ❌ | Users see actions on their account |

## Verification Steps

### 1. Check RLS is Enabled on All Tables

```sql
SELECT 
    tablename, 
    rowsecurity as "RLS Enabled",
    CASE 
        WHEN rowsecurity THEN '✅'
        ELSE '❌ SECURITY RISK!'
    END as status
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN (
    'users', 'wallets', 'transactions', 'sessions', 'bank_accounts',
    'pending_payments', 'weekly_activity', 'rate_limit_counters',
    'ledger_entries', 'weekly_cycles', 'reserve_snapshots', 'audit_logs'
  )
ORDER BY tablename;
```

Expected: All should show `RLS Enabled = true`

### 2. Count Policies Per Table

```sql
SELECT 
    tablename, 
    COUNT(*) as policy_count,
    CASE 
        WHEN COUNT(*) > 0 THEN '✅'
        ELSE '⚠️ No policies!'
    END as status
FROM pg_policies 
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'wallets', 'transactions', 'sessions', 'bank_accounts',
    'pending_payments', 'weekly_activity', 'rate_limit_counters',
    'ledger_entries', 'weekly_cycles', 'reserve_snapshots', 'audit_logs'
  )
GROUP BY tablename
ORDER BY tablename;
```

Expected: Each table should have at least 1 policy

### 3. Test User Access

Test that users can:
- ✅ Read their own wallet
- ✅ Read their own transactions
- ✅ Read public feed transactions
- ✅ Read their own sessions
- ✅ Read their own bank accounts
- ❌ Cannot read other users' wallets
- ❌ Cannot read other users' private transactions

### 4. Test Anonymous Access

Anonymous users should have **NO access** to any table.

## Important Notes

### Service Role Bypass

The `service_role` (used by your backend API) **automatically bypasses RLS**. This means:
- Your backend can still access all data when needed
- RLS only applies to requests made through PostgREST (Supabase API)
- Direct database connections with service_role are not affected

### Data Type Handling

All user ID columns are stored as `TEXT` but contain UUIDs. Policies use `user_id::uuid = auth.uid()` to properly compare with Supabase's `auth.uid()` which returns UUID.

### Public Feed Access

The `transactions` table allows authenticated users to see:
- Their own transactions (sent and received)
- Public completed payments (for the feed)

This is necessary for the payment feed functionality.

### System Tables

Tables like `weekly_cycles`, `reserve_snapshots`, and `audit_logs` are:
- **Read-only** for authenticated users (for transparency)
- **Write-protected** - only service_role can INSERT/UPDATE
- Users can see audit logs where they are the actor or subject

### Performance

Indexes have been created on foreign keys used in policies for optimal performance:
- `user_id` columns
- `from_user_id` and `to_user_id` in transactions
- `wallet_id` in ledger_entries
- etc.

## Testing Checklist

After applying the migration, test:

- [ ] User registration (creates user + wallet)
- [ ] User login (creates session)
- [ ] View own wallet balance
- [ ] Send payment to another user
- [ ] Receive payment from another user
- [ ] View transaction history (own)
- [ ] View public payment feed
- [ ] Link bank account
- [ ] View own bank accounts
- [ ] Send payment to phone number (creates pending_payment)
- [ ] Claim pending payment
- [ ] View weekly activity (own)
- [ ] View weekly cycles (public)
- [ ] View reserve snapshots (public)
- [ ] View audit logs (own)

## Rollback (If Needed)

If you need to rollback (NOT RECOMMENDED):

```sql
-- Disable RLS on all tables (SECURITY RISK!)
ALTER TABLE public.wallets DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_activity DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_counters DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_cycles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reserve_snapshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;

-- Drop all policies
-- (Use DROP POLICY IF EXISTS for each policy)
```

**Warning**: Disabling RLS will expose all data. Only do this if absolutely necessary and re-enable immediately.

## Next Steps

1. ✅ Apply `enable_rls_users.sql` (if not done)
2. ✅ Apply `enable_rls_all_tables.sql`
3. ✅ Run verification queries
4. ✅ Test your application thoroughly
5. ✅ Monitor Supabase logs for policy violations
6. ✅ Adjust policies if legitimate requests are being blocked

## Support

If you encounter issues:
1. Check Supabase logs for policy violation errors
2. Verify your JWT tokens include the correct `sub` claim
3. Ensure `auth.uid()` returns the correct UUID format
4. Test with different user roles (anon, authenticated, service_role)
5. Use the test script: `test_rls_all_tables.sql`

