# PaYa Database Schema
## MVP v1 — Full Reserve P2P Payment Network

---

## Design Principles

1. **Immutable Ledger** — Never update/delete transaction records, only append
2. **Double-Entry Accounting** — Every token movement has debit + credit entries
3. **Atomic Operations** — All balance changes in database transactions
4. **Audit Trail** — Every state change is logged with actor and timestamp
5. **Soft Deletes** — Mark records inactive, never hard delete

---

## Core Tables

### Users

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(30) UNIQUE NOT NULL,  -- @username (lowercase, alphanumeric + underscore)
    phone_hash      VARCHAR(64) UNIQUE NOT NULL,  -- SHA256 of phone for privacy
    phone_last_four VARCHAR(4) NOT NULL,          -- For display/support
    
    -- Status
    status          VARCHAR(20) DEFAULT 'active', -- active, frozen, suspended, deleted
    flags           JSONB DEFAULT '[]',           -- ['fraud_review', 'reward_ineligible', etc.]
    
    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    last_active_at  TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_]{3,30}$')
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_phone_hash ON users(phone_hash);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_created_at ON users(created_at);
```

### Wallets

```sql
CREATE TABLE wallets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID UNIQUE NOT NULL REFERENCES users(id),
    
    -- Balance (integer tokens only, 1 token = $1)
    balance         BIGINT NOT NULL DEFAULT 0,
    
    -- Computed totals for validation
    total_loaded    BIGINT DEFAULT 0,
    total_sent      BIGINT DEFAULT 0,
    total_received  BIGINT DEFAULT 0,
    total_redeemed  BIGINT DEFAULT 0,
    total_rewards   BIGINT DEFAULT 0,
    
    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    
    -- Balance must never go negative
    CONSTRAINT positive_balance CHECK (balance >= 0)
);

CREATE INDEX idx_wallets_user_id ON wallets(user_id);
```

### Bank Accounts (Linked via Plaid)

```sql
CREATE TABLE bank_accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),
    
    -- Plaid tokens (encrypted at rest)
    plaid_access_token  TEXT NOT NULL,        -- Encrypted
    plaid_account_id    VARCHAR(100) NOT NULL,
    plaid_item_id       VARCHAR(100) NOT NULL,
    
    -- Dwolla funding source
    dwolla_source_id    VARCHAR(100),         -- Created after verification
    dwolla_source_url   TEXT,
    
    -- Display info (from Plaid)
    institution_name    VARCHAR(100),
    account_name        VARCHAR(100),
    account_mask        VARCHAR(4),           -- Last 4 digits
    account_type        VARCHAR(20),          -- checking, savings
    
    -- Status
    status              VARCHAR(20) DEFAULT 'pending', -- pending, verified, failed, removed
    verified_at         TIMESTAMPTZ,
    
    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    removed_at          TIMESTAMPTZ,          -- Soft delete
    
    -- One active account per user for MVP
    UNIQUE(user_id) WHERE status = 'verified'
);

CREATE INDEX idx_bank_accounts_user_id ON bank_accounts(user_id);
CREATE INDEX idx_bank_accounts_status ON bank_accounts(status);
```

### Transactions (Immutable Ledger)

```sql
-- Transaction types enum
CREATE TYPE transaction_type AS ENUM (
    'load',           -- USD → Tokens (bank to wallet)
    'payment',        -- Tokens → Tokens (user to user)
    'redemption',     -- Tokens → USD (wallet to bank)
    'reward',         -- Weekly reward distribution
    'fee',            -- Fee deduction
    'adjustment'      -- Admin adjustment (rare)
);

CREATE TYPE transaction_status AS ENUM (
    'pending',        -- Initiated, awaiting external confirmation
    'processing',     -- External provider processing
    'completed',      -- Successfully finished
    'failed',         -- Failed (funds returned if applicable)
    'cancelled'       -- Cancelled by user/system
);

CREATE TABLE transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type                transaction_type NOT NULL,
    status              transaction_status DEFAULT 'pending',
    
    -- Parties
    from_user_id        UUID REFERENCES users(id),  -- NULL for loads
    to_user_id          UUID REFERENCES users(id),  -- NULL for redemptions
    
    -- Amount (always positive, direction determined by type)
    amount              BIGINT NOT NULL CHECK (amount > 0),
    fee_amount          BIGINT DEFAULT 0,
    
    -- For payments
    memo                VARCHAR(280),
    is_public           BOOLEAN DEFAULT TRUE,
    
    -- External references
    external_id         VARCHAR(100),             -- Dwolla transfer ID, etc.
    external_status     VARCHAR(50),
    
    -- Metadata
    metadata            JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    
    -- Idempotency
    idempotency_key     VARCHAR(100) UNIQUE
);

CREATE INDEX idx_transactions_from_user ON transactions(from_user_id);
CREATE INDEX idx_transactions_to_user ON transactions(to_user_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_external_id ON transactions(external_id);
CREATE INDEX idx_transactions_is_public ON transactions(is_public) WHERE is_public = TRUE;

-- For feed queries (public payments only, recent first)
CREATE INDEX idx_transactions_feed ON transactions(created_at DESC) 
    WHERE type = 'payment' AND is_public = TRUE AND status = 'completed';
```

### Ledger Entries (Double-Entry)

```sql
-- Every balance change creates two entries: debit and credit
CREATE TYPE ledger_entry_type AS ENUM ('debit', 'credit');

CREATE TABLE ledger_entries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id      UUID NOT NULL REFERENCES transactions(id),
    wallet_id           UUID NOT NULL REFERENCES wallets(id),
    
    entry_type          ledger_entry_type NOT NULL,
    amount              BIGINT NOT NULL CHECK (amount > 0),
    
    -- Running balance after this entry (for audit)
    balance_after       BIGINT NOT NULL,
    
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ledger_entries_transaction ON ledger_entries(transaction_id);
CREATE INDEX idx_ledger_entries_wallet ON ledger_entries(wallet_id);
CREATE INDEX idx_ledger_entries_created_at ON ledger_entries(created_at);
```

### Sessions (Device Tokens)

```sql
CREATE TABLE sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),
    
    -- Token (stored as hash)
    token_hash          VARCHAR(64) NOT NULL UNIQUE,
    
    -- Device info
    device_id           VARCHAR(100),
    device_name         VARCHAR(100),
    device_platform     VARCHAR(20),          -- ios, android, web
    
    -- Status
    is_active           BOOLEAN DEFAULT TRUE,
    
    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    last_used_at        TIMESTAMPTZ DEFAULT NOW(),
    expires_at          TIMESTAMPTZ NOT NULL,
    revoked_at          TIMESTAMPTZ
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
```

### Weekly Cycles (Reward Distribution)

```sql
CREATE TABLE weekly_cycles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Week boundaries
    week_number         INTEGER NOT NULL UNIQUE, -- ISO week number + year (e.g., 202448)
    starts_at           TIMESTAMPTZ NOT NULL,
    ends_at             TIMESTAMPTZ NOT NULL,
    
    -- Revenue
    total_revenue       BIGINT DEFAULT 0,        -- In cents
    ops_allocation      BIGINT DEFAULT 0,        -- Ops cut
    user_pool           BIGINT DEFAULT 0,        -- Distributed to users
    remainder           BIGINT DEFAULT 0,        -- Carried to next week
    
    -- Participation
    active_user_count   INTEGER DEFAULT 0,
    per_user_reward     BIGINT DEFAULT 0,        -- floor(user_pool / active_count)
    
    -- Status
    status              VARCHAR(20) DEFAULT 'open', -- open, calculating, distributed, finalized
    distributed_at      TIMESTAMPTZ,
    
    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_weekly_cycles_week ON weekly_cycles(week_number);
CREATE INDEX idx_weekly_cycles_status ON weekly_cycles(status);
```

### Weekly Activity (User Participation)

```sql
CREATE TABLE weekly_activity (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),
    cycle_id            UUID NOT NULL REFERENCES weekly_cycles(id),
    
    -- Activity counts
    public_payments_sent    INTEGER DEFAULT 0,
    public_payments_received INTEGER DEFAULT 0,
    private_payments_sent   INTEGER DEFAULT 0,
    
    -- Eligibility
    is_eligible         BOOLEAN DEFAULT FALSE, -- Met criteria for rewards
    
    -- Reward received
    reward_amount       BIGINT DEFAULT 0,
    reward_tx_id        UUID REFERENCES transactions(id),
    
    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, cycle_id)
);

CREATE INDEX idx_weekly_activity_user ON weekly_activity(user_id);
CREATE INDEX idx_weekly_activity_cycle ON weekly_activity(cycle_id);
CREATE INDEX idx_weekly_activity_eligible ON weekly_activity(is_eligible) WHERE is_eligible = TRUE;
```

### System Reserve (Reserve Balance Tracking)

```sql
CREATE TABLE reserve_snapshots (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Balances
    reserve_balance_cents   BIGINT NOT NULL,     -- Actual USD in reserve account
    total_tokens_circulation BIGINT NOT NULL,    -- Sum of all wallet balances
    
    -- Should always match (reserve >= tokens * 100)
    is_balanced         BOOLEAN NOT NULL,
    discrepancy_cents   BIGINT DEFAULT 0,
    
    -- Source
    source              VARCHAR(50),             -- 'daily_reconciliation', 'manual_audit'
    
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reserve_snapshots_created ON reserve_snapshots(created_at);
```

### Audit Log

```sql
CREATE TABLE audit_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Actor
    actor_type          VARCHAR(20) NOT NULL,    -- 'user', 'admin', 'system'
    actor_id            UUID,
    
    -- Action
    action              VARCHAR(50) NOT NULL,    -- 'account_freeze', 'balance_adjustment', etc.
    resource_type       VARCHAR(50),             -- 'user', 'wallet', 'transaction'
    resource_id         UUID,
    
    -- Details
    details             JSONB DEFAULT '{}',
    ip_address          INET,
    user_agent          TEXT,
    
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
```

### Rate Limits (Tracked in DB for persistence)

```sql
CREATE TABLE rate_limit_counters (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),
    
    -- Counter type
    counter_type        VARCHAR(50) NOT NULL,    -- 'sends_hourly', 'sends_daily', etc.
    window_start        TIMESTAMPTZ NOT NULL,
    
    -- Count
    count               INTEGER DEFAULT 0,
    
    UNIQUE(user_id, counter_type, window_start)
);

CREATE INDEX idx_rate_limits_user ON rate_limit_counters(user_id);
CREATE INDEX idx_rate_limits_window ON rate_limit_counters(window_start);
```

---

## Views

### Public Feed View

```sql
CREATE VIEW public_feed AS
SELECT 
    t.id,
    t.created_at,
    t.amount,
    t.memo,
    sender.username AS from_username,
    recipient.username AS to_username
FROM transactions t
JOIN users sender ON t.from_user_id = sender.id
JOIN users recipient ON t.to_user_id = recipient.id
WHERE t.type = 'payment'
  AND t.is_public = TRUE
  AND t.status = 'completed'
  AND sender.status = 'active'
  AND recipient.status = 'active'
ORDER BY t.created_at DESC;
```

### Transparency Dashboard View

```sql
CREATE VIEW transparency_dashboard AS
SELECT 
    (SELECT reserve_balance_cents FROM reserve_snapshots ORDER BY created_at DESC LIMIT 1) AS reserve_usd_cents,
    (SELECT SUM(balance) FROM wallets) AS total_tokens,
    (SELECT total_revenue FROM weekly_cycles WHERE status = 'finalized' ORDER BY ends_at DESC LIMIT 1) AS last_week_revenue,
    (SELECT ops_allocation FROM weekly_cycles WHERE status = 'finalized' ORDER BY ends_at DESC LIMIT 1) AS last_week_ops,
    (SELECT user_pool FROM weekly_cycles WHERE status = 'finalized' ORDER BY ends_at DESC LIMIT 1) AS last_week_pool,
    (SELECT active_user_count FROM weekly_cycles WHERE status = 'finalized' ORDER BY ends_at DESC LIMIT 1) AS last_week_active_users,
    (SELECT per_user_reward FROM weekly_cycles WHERE status = 'finalized' ORDER BY ends_at DESC LIMIT 1) AS last_week_per_user;
```

---

## Critical Functions

### Safe Token Transfer

```sql
CREATE OR REPLACE FUNCTION transfer_tokens(
    p_from_user_id UUID,
    p_to_user_id UUID,
    p_amount BIGINT,
    p_memo VARCHAR(280),
    p_is_public BOOLEAN,
    p_idempotency_key VARCHAR(100)
) RETURNS UUID AS $$
DECLARE
    v_from_wallet_id UUID;
    v_to_wallet_id UUID;
    v_from_balance BIGINT;
    v_to_balance BIGINT;
    v_transaction_id UUID;
BEGIN
    -- Check idempotency
    SELECT id INTO v_transaction_id 
    FROM transactions 
    WHERE idempotency_key = p_idempotency_key;
    
    IF v_transaction_id IS NOT NULL THEN
        RETURN v_transaction_id;
    END IF;

    -- Lock wallets in consistent order to prevent deadlocks
    SELECT id, balance INTO v_from_wallet_id, v_from_balance
    FROM wallets
    WHERE user_id = p_from_user_id
    FOR UPDATE;
    
    SELECT id, balance INTO v_to_wallet_id, v_to_balance
    FROM wallets
    WHERE user_id = p_to_user_id
    FOR UPDATE;
    
    -- Validate
    IF v_from_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient balance';
    END IF;
    
    -- Create transaction
    INSERT INTO transactions (type, status, from_user_id, to_user_id, amount, memo, is_public, idempotency_key, completed_at)
    VALUES ('payment', 'completed', p_from_user_id, p_to_user_id, p_amount, p_memo, p_is_public, p_idempotency_key, NOW())
    RETURNING id INTO v_transaction_id;
    
    -- Update balances
    UPDATE wallets SET 
        balance = balance - p_amount,
        total_sent = total_sent + p_amount,
        updated_at = NOW()
    WHERE id = v_from_wallet_id;
    
    UPDATE wallets SET 
        balance = balance + p_amount,
        total_received = total_received + p_amount,
        updated_at = NOW()
    WHERE id = v_to_wallet_id;
    
    -- Create ledger entries
    INSERT INTO ledger_entries (transaction_id, wallet_id, entry_type, amount, balance_after)
    VALUES 
        (v_transaction_id, v_from_wallet_id, 'debit', p_amount, v_from_balance - p_amount),
        (v_transaction_id, v_to_wallet_id, 'credit', p_amount, v_to_balance + p_amount);
    
    RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql;
```

### Weekly Reward Distribution

```sql
CREATE OR REPLACE FUNCTION distribute_weekly_rewards(
    p_cycle_id UUID,
    p_ops_percentage DECIMAL DEFAULT 0.10  -- 10% to ops
) RETURNS INTEGER AS $$
DECLARE
    v_cycle weekly_cycles%ROWTYPE;
    v_total_revenue BIGINT;
    v_ops_cut BIGINT;
    v_user_pool BIGINT;
    v_active_count INTEGER;
    v_per_user BIGINT;
    v_distributed_count INTEGER := 0;
    v_activity RECORD;
    v_tx_id UUID;
BEGIN
    -- Lock cycle
    SELECT * INTO v_cycle FROM weekly_cycles WHERE id = p_cycle_id FOR UPDATE;
    
    IF v_cycle.status != 'calculating' THEN
        RAISE EXCEPTION 'Cycle not in calculating status';
    END IF;
    
    -- Calculate distribution
    v_total_revenue := v_cycle.total_revenue;
    v_ops_cut := FLOOR(v_total_revenue * p_ops_percentage);
    v_user_pool := v_total_revenue - v_ops_cut;
    
    -- Count active users (sent at least 1 public payment)
    SELECT COUNT(*) INTO v_active_count
    FROM weekly_activity
    WHERE cycle_id = p_cycle_id AND public_payments_sent >= 1;
    
    IF v_active_count = 0 THEN
        -- No active users, carry everything forward
        UPDATE weekly_cycles SET
            status = 'distributed',
            ops_allocation = 0,
            user_pool = 0,
            remainder = v_total_revenue,
            active_user_count = 0,
            per_user_reward = 0,
            distributed_at = NOW()
        WHERE id = p_cycle_id;
        RETURN 0;
    END IF;
    
    -- Calculate per-user reward (integer division)
    v_per_user := FLOOR(v_user_pool / v_active_count);
    
    -- Mark eligible users
    UPDATE weekly_activity SET is_eligible = TRUE
    WHERE cycle_id = p_cycle_id AND public_payments_sent >= 1;
    
    -- Distribute to each eligible user
    FOR v_activity IN 
        SELECT wa.*, u.id as uid 
        FROM weekly_activity wa
        JOIN users u ON wa.user_id = u.id
        WHERE wa.cycle_id = p_cycle_id 
          AND wa.is_eligible = TRUE
          AND u.status = 'active'
          AND NOT ('reward_ineligible' = ANY(u.flags::text[]))
    LOOP
        -- Create reward transaction
        INSERT INTO transactions (type, status, to_user_id, amount, metadata, completed_at)
        VALUES ('reward', 'completed', v_activity.user_id, v_per_user, 
                jsonb_build_object('cycle_id', p_cycle_id, 'week', v_cycle.week_number), NOW())
        RETURNING id INTO v_tx_id;
        
        -- Credit wallet
        UPDATE wallets SET
            balance = balance + v_per_user,
            total_rewards = total_rewards + v_per_user,
            updated_at = NOW()
        WHERE user_id = v_activity.user_id;
        
        -- Update activity record
        UPDATE weekly_activity SET
            reward_amount = v_per_user,
            reward_tx_id = v_tx_id
        WHERE id = v_activity.id;
        
        v_distributed_count := v_distributed_count + 1;
    END LOOP;
    
    -- Finalize cycle
    UPDATE weekly_cycles SET
        status = 'distributed',
        ops_allocation = v_ops_cut,
        user_pool = v_per_user * v_distributed_count,
        remainder = v_user_pool - (v_per_user * v_distributed_count),
        active_user_count = v_distributed_count,
        per_user_reward = v_per_user,
        distributed_at = NOW()
    WHERE id = p_cycle_id;
    
    RETURN v_distributed_count;
END;
$$ LANGUAGE plpgsql;
```

---

## Row Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY users_own_data ON users
    FOR ALL USING (id = current_setting('app.current_user_id')::UUID);

CREATE POLICY wallets_own_data ON wallets
    FOR ALL USING (user_id = current_setting('app.current_user_id')::UUID);

CREATE POLICY bank_accounts_own_data ON bank_accounts
    FOR ALL USING (user_id = current_setting('app.current_user_id')::UUID);

CREATE POLICY sessions_own_data ON sessions
    FOR ALL USING (user_id = current_setting('app.current_user_id')::UUID);

-- Transactions: own data + public feed items
CREATE POLICY transactions_visible ON transactions
    FOR SELECT USING (
        from_user_id = current_setting('app.current_user_id')::UUID
        OR to_user_id = current_setting('app.current_user_id')::UUID
        OR (type = 'payment' AND is_public = TRUE AND status = 'completed')
    );

-- Service role bypasses RLS for system operations
CREATE POLICY service_role_bypass ON users FOR ALL TO service_role USING (true);
CREATE POLICY service_role_bypass ON wallets FOR ALL TO service_role USING (true);
-- ... repeat for other tables
```

---

## Indexes for Performance

```sql
-- Composite indexes for common queries

-- Get user's transaction history
CREATE INDEX idx_transactions_user_history ON transactions(from_user_id, created_at DESC)
    WHERE status = 'completed';

-- Get pending loads/redemptions
CREATE INDEX idx_transactions_pending ON transactions(status, type, created_at)
    WHERE status = 'pending';

-- Weekly activity lookup
CREATE INDEX idx_weekly_activity_lookup ON weekly_activity(cycle_id, is_eligible)
    WHERE is_eligible = TRUE;

-- Recent sessions check
CREATE INDEX idx_sessions_active ON sessions(user_id, is_active, expires_at)
    WHERE is_active = TRUE;
```

---

## Data Retention

```sql
-- Partition transactions by month for efficient archival
-- (Implementation depends on PostgreSQL version and expected volume)

-- Archive old audit logs
CREATE TABLE audit_logs_archive (LIKE audit_logs INCLUDING ALL);

-- Move logs older than 1 year to archive
CREATE OR REPLACE FUNCTION archive_old_audit_logs() RETURNS void AS $$
BEGIN
    INSERT INTO audit_logs_archive
    SELECT * FROM audit_logs WHERE created_at < NOW() - INTERVAL '1 year';
    
    DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '1 year';
END;
$$ LANGUAGE plpgsql;
```

---

## Migration Strategy

1. **Initial Deploy** — Create all tables with constraints
2. **Seed Data** — System reserve account, first weekly cycle
3. **Backfill** — If migrating from existing system
4. **Enable RLS** — After verifying application sets user context
5. **Enable Triggers** — After testing in staging

---

*Schema Version: 1.0*  
*PostgreSQL Version: 15+*

