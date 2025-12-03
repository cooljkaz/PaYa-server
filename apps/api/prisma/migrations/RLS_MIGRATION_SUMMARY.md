# RLS Migration Summary

## ⚠️ Important: Consider Disabling PostgREST First

**If you're not using Supabase's REST API**, you should **disable PostgREST** instead of (or in addition to) enabling RLS. This is a better security practice.

See `DISABLE_POSTGREST.md` for instructions on how to disable PostgREST in Supabase.

**Recommended approach**: Disable PostgREST + Enable RLS (defense in depth)

## Quick Start

You have **12 tables** that need RLS enabled. Here's the complete solution:

### Files Created

1. **`enable_rls_users.sql`** - RLS for `users` table
2. **`enable_rls_all_tables.sql`** - RLS for all other 11 tables
3. **`RLS_MIGRATION_README.md`** - Detailed guide for users table
4. **`RLS_ALL_TABLES_README.md`** - Detailed guide for all tables
5. **`test_rls_policies.sql`** - Test script for users table
6. **`test_rls_all_tables.sql`** - Test script for all tables

## Application Order

### Step 1: Apply Users Table RLS

```sql
-- Run: enable_rls_users.sql
```

This enables RLS on `public.users` and creates 5 policies.

### Step 2: Apply All Other Tables RLS

```sql
-- Run: enable_rls_all_tables.sql
```

This enables RLS on the remaining 11 tables:
- wallets
- transactions
- sessions
- bank_accounts
- pending_payments
- weekly_activity
- rate_limit_counters
- ledger_entries
- weekly_cycles
- reserve_snapshots
- audit_logs

### Step 3: Verify

Run the test scripts to verify everything is working:

```sql
-- Test users table
-- Run: test_rls_policies.sql

-- Test all tables
-- Run: test_rls_all_tables.sql
```

## Tables and Access Patterns

| Table | User Access | Notes |
|-------|-------------|-------|
| **users** | Own row + search others | Can search for usernames |
| **wallets** | Own wallet only | Balance changes via transactions |
| **transactions** | Own + public feed | Public completed payments visible |
| **sessions** | Own sessions only | Full CRUD |
| **bank_accounts** | Own accounts only | Full CRUD |
| **pending_payments** | Sent/claimed only | Can't delete |
| **weekly_activity** | Own + public eligible | Read-only |
| **rate_limit_counters** | Own counters only | System managed |
| **ledger_entries** | Own wallet entries | Read-only |
| **weekly_cycles** | Read all | Read-only, system managed |
| **reserve_snapshots** | Read all | Read-only, system managed |
| **audit_logs** | Own records only | Actions on user's account |

## Security Features

✅ **Default Deny** - RLS blocks all access until policies allow it  
✅ **User Isolation** - Users can only access their own data  
✅ **Public Feed** - Authenticated users can see public transactions  
✅ **No Anonymous Access** - Anonymous users have no access  
✅ **Service Role Bypass** - Backend API (service_role) has full access  
✅ **System Tables Protected** - System tables are read-only for users  

## Important Notes

1. **Service Role**: Your backend API uses `service_role` which automatically bypasses RLS. Your application will continue to work normally.

2. **Data Types**: All user ID columns are `TEXT` containing UUIDs. Policies use `user_id::uuid = auth.uid()` for comparison.

3. **Testing**: After applying, thoroughly test:
   - User registration
   - Login/logout
   - Sending/receiving payments
   - Viewing transaction history
   - Public feed functionality
   - Bank account linking

4. **Monitoring**: Watch Supabase logs for any policy violations after deployment.

## Need Help?

- See `RLS_MIGRATION_README.md` for users table details
- See `RLS_ALL_TABLES_README.md` for all tables details
- Run test scripts to verify policies are working
- Check Supabase logs for policy violation errors

## Status

- [x] Users table RLS migration created
- [x] All other tables RLS migration created
- [x] Documentation created
- [x] Test scripts created
- [ ] **TODO: Apply migrations to your database**
- [ ] **TODO: Run test scripts to verify**
- [ ] **TODO: Test your application**

