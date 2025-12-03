# Disable PostgREST API in Supabase

## Why Disable PostgREST?

If you're **not using Supabase's REST API** (PostgREST), you should **disable it** to:
- ✅ Reduce attack surface
- ✅ Prevent accidental exposure
- ✅ Follow security best practices (defense in depth)
- ✅ Eliminate the need for RLS if you're only using direct database connections

## How to Disable PostgREST

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to your **Supabase project dashboard**
2. Navigate to **Settings** → **API**
3. Find **"Data API Settings"** section
4. Toggle **"Enable Data API"** to **OFF**
5. Click **Save**

This disables:
- ✅ REST API endpoints (`/rest/v1/`)
- ✅ GraphQL API endpoints (`/graphql/v1/`)
- ✅ Realtime subscriptions (if enabled)

### Option 2: Via Supabase CLI

If you're using Supabase CLI for local development:

```bash
# In your supabase/config.toml
[api]
enabled = false
```

### Option 3: Restrict Schema Exposure (Alternative)

If you want to keep PostgREST enabled but restrict which schemas are exposed:

1. Go to **Settings** → **API**
2. Under **"Exposed Schemas"**, uncheck `public`
3. Only expose schemas you actually need (if any)

## Verification

After disabling, test that PostgREST is no longer accessible:

```bash
# This should return 404 or be blocked
curl https://[your-project-ref].supabase.co/rest/v1/users

# This should still work (direct connection)
psql "postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
```

## Impact on Your Application

### ✅ What Still Works

- ✅ **Prisma queries** - Direct database connections work normally
- ✅ **Your backend API** - No impact at all
- ✅ **Database functions** - All PostgreSQL functions work
- ✅ **Direct SQL queries** - Via psql, Prisma, etc.

### ❌ What Stops Working

- ❌ **Supabase REST API** - `/rest/v1/*` endpoints
- ❌ **Supabase GraphQL API** - `/graphql/v1/*` endpoints
- ❌ **Direct client access** - If you were using Supabase client library

## Do You Still Need RLS?

### If PostgREST is Disabled

**You technically don't need RLS** because:
- PostgREST is the only way RLS is enforced
- Direct database connections bypass RLS
- Your Prisma queries bypass RLS

### But RLS is Still Recommended

Even with PostgREST disabled, enabling RLS is still a good idea because:

1. **Future-proofing** - If you re-enable PostgREST later, RLS is already configured
2. **Defense in depth** - Multiple layers of security
3. **Compliance** - Some security audits require RLS on sensitive tables
4. **Zero cost** - RLS has no performance impact when PostgREST is disabled

## Recommended Approach

### Best Practice: Disable PostgREST + Enable RLS

1. ✅ **Disable PostgREST** (reduce attack surface)
2. ✅ **Enable RLS** (defense in depth, future-proofing)

This gives you:
- **Immediate security** - PostgREST is disabled
- **Future protection** - RLS is ready if you re-enable PostgREST
- **Best of both worlds** - Maximum security with minimal overhead

## Migration Strategy

### Step 1: Disable PostgREST

1. Go to Supabase Dashboard → Settings → API
2. Disable "Enable Data API"
3. Save

### Step 2: Enable RLS (Optional but Recommended)

Apply the RLS migrations:
- `enable_rls_users.sql`
- `enable_rls_all_tables.sql`

### Step 3: Verify

1. Test that PostgREST endpoints return 404
2. Test that your Prisma queries still work
3. Test your application end-to-end

## Rollback

If you need to re-enable PostgREST:

1. Go to Supabase Dashboard → Settings → API
2. Toggle "Enable Data API" to **ON**
3. Save

Your RLS policies will immediately protect the exposed endpoints.

## Summary

| Action | Security Benefit | Code Impact |
|--------|-----------------|-------------|
| **Disable PostgREST** | ✅ Eliminates REST API attack surface | ✅ None |
| **Enable RLS** | ✅ Defense in depth, future-proofing | ✅ None |
| **Both** | ✅ Maximum security | ✅ None |

## Next Steps

1. ✅ Disable PostgREST in Supabase Dashboard
2. ✅ (Optional) Apply RLS migrations for defense in depth
3. ✅ Test your application to ensure everything works
4. ✅ Document that PostgREST is disabled in your security docs

