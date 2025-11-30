-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" VARCHAR(30) NOT NULL,
    "phone_hash" VARCHAR(64) NOT NULL,
    "phone_last_four" VARCHAR(4) NOT NULL,
    "synctera_customer_id" VARCHAR(100),
    "synctera_account_id" VARCHAR(100),
    "kyc_status" VARCHAR(20),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "flags" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_active_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "total_loaded" BIGINT NOT NULL DEFAULT 0,
    "total_sent" BIGINT NOT NULL DEFAULT 0,
    "total_received" BIGINT NOT NULL DEFAULT 0,
    "total_redeemed" BIGINT NOT NULL DEFAULT 0,
    "total_rewards" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "synctera_external_account_id" VARCHAR(100),
    "routing_number" VARCHAR(9),
    "account_number_last4" VARCHAR(4),
    "plaid_access_token" TEXT,
    "plaid_account_id" VARCHAR(100),
    "plaid_item_id" VARCHAR(100),
    "institution_name" VARCHAR(100),
    "account_name" VARCHAR(100),
    "account_mask" VARCHAR(4),
    "account_type" VARCHAR(20),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "from_user_id" TEXT,
    "to_user_id" TEXT,
    "amount" BIGINT NOT NULL,
    "fee_amount" BIGINT NOT NULL DEFAULT 0,
    "memo" VARCHAR(280),
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "external_id" VARCHAR(100),
    "external_status" VARCHAR(50),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "idempotency_key" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "entry_type" VARCHAR(10) NOT NULL,
    "amount" BIGINT NOT NULL,
    "balance_after" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "device_id" VARCHAR(100),
    "device_name" VARCHAR(100),
    "device_platform" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_cycles" (
    "id" TEXT NOT NULL,
    "week_number" INTEGER NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "total_revenue" BIGINT NOT NULL DEFAULT 0,
    "ops_allocation" BIGINT NOT NULL DEFAULT 0,
    "user_pool" BIGINT NOT NULL DEFAULT 0,
    "remainder" BIGINT NOT NULL DEFAULT 0,
    "active_user_count" INTEGER NOT NULL DEFAULT 0,
    "per_user_reward" BIGINT NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "distributed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_activity" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "week_number" INTEGER NOT NULL,
    "public_payments_sent" INTEGER NOT NULL DEFAULT 0,
    "public_payments_received" INTEGER NOT NULL DEFAULT 0,
    "private_payments_sent" INTEGER NOT NULL DEFAULT 0,
    "is_eligible" BOOLEAN NOT NULL DEFAULT false,
    "reward_amount" BIGINT NOT NULL DEFAULT 0,
    "reward_tx_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reserve_snapshots" (
    "id" TEXT NOT NULL,
    "reserve_balance_cents" BIGINT NOT NULL,
    "total_tokens_circulation" BIGINT NOT NULL,
    "is_balanced" BOOLEAN NOT NULL,
    "discrepancy_cents" BIGINT NOT NULL DEFAULT 0,
    "source" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reserve_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_type" VARCHAR(20) NOT NULL,
    "actor_id" TEXT,
    "action" VARCHAR(50) NOT NULL,
    "resource_type" VARCHAR(50),
    "resource_id" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_counters" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "counter_type" VARCHAR(50) NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_payments" (
    "id" TEXT NOT NULL,
    "from_user_id" TEXT NOT NULL,
    "to_phone_hash" VARCHAR(64) NOT NULL,
    "to_phone_last_four" VARCHAR(4) NOT NULL,
    "amount" BIGINT NOT NULL,
    "memo" VARCHAR(280),
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "claimed_by_user_id" TEXT,
    "claimed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "invite_sent_at" TIMESTAMP(3),
    "invite_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_hash_key" ON "users"("phone_hash");

-- CreateIndex
CREATE UNIQUE INDEX "users_synctera_customer_id_key" ON "users"("synctera_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_synctera_account_id_key" ON "users"("synctera_account_id");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_phone_hash_idx" ON "users"("phone_hash");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "users_synctera_customer_id_idx" ON "users"("synctera_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE INDEX "wallets_user_id_idx" ON "wallets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_synctera_external_account_id_key" ON "bank_accounts"("synctera_external_account_id");

-- CreateIndex
CREATE INDEX "bank_accounts_user_id_idx" ON "bank_accounts"("user_id");

-- CreateIndex
CREATE INDEX "bank_accounts_status_idx" ON "bank_accounts"("status");

-- CreateIndex
CREATE INDEX "bank_accounts_synctera_external_account_id_idx" ON "bank_accounts"("synctera_external_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_idempotency_key_key" ON "transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "transactions_from_user_id_idx" ON "transactions"("from_user_id");

-- CreateIndex
CREATE INDEX "transactions_to_user_id_idx" ON "transactions"("to_user_id");

-- CreateIndex
CREATE INDEX "transactions_type_idx" ON "transactions"("type");

-- CreateIndex
CREATE INDEX "transactions_status_idx" ON "transactions"("status");

-- CreateIndex
CREATE INDEX "transactions_created_at_idx" ON "transactions"("created_at");

-- CreateIndex
CREATE INDEX "transactions_external_id_idx" ON "transactions"("external_id");

-- CreateIndex
CREATE INDEX "transactions_is_public_type_status_created_at_idx" ON "transactions"("is_public", "type", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ledger_entries_transaction_id_idx" ON "ledger_entries"("transaction_id");

-- CreateIndex
CREATE INDEX "ledger_entries_wallet_id_idx" ON "ledger_entries"("wallet_id");

-- CreateIndex
CREATE INDEX "ledger_entries_created_at_idx" ON "ledger_entries"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_token_hash_idx" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_cycles_week_number_key" ON "weekly_cycles"("week_number");

-- CreateIndex
CREATE INDEX "weekly_cycles_week_number_idx" ON "weekly_cycles"("week_number");

-- CreateIndex
CREATE INDEX "weekly_cycles_status_idx" ON "weekly_cycles"("status");

-- CreateIndex
CREATE INDEX "weekly_activity_user_id_idx" ON "weekly_activity"("user_id");

-- CreateIndex
CREATE INDEX "weekly_activity_week_number_idx" ON "weekly_activity"("week_number");

-- CreateIndex
CREATE INDEX "weekly_activity_is_eligible_idx" ON "weekly_activity"("is_eligible");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_activity_user_id_week_number_key" ON "weekly_activity"("user_id", "week_number");

-- CreateIndex
CREATE INDEX "reserve_snapshots_created_at_idx" ON "reserve_snapshots"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "rate_limit_counters_user_id_idx" ON "rate_limit_counters"("user_id");

-- CreateIndex
CREATE INDEX "rate_limit_counters_window_start_idx" ON "rate_limit_counters"("window_start");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_counters_user_id_counter_type_window_start_key" ON "rate_limit_counters"("user_id", "counter_type", "window_start");

-- CreateIndex
CREATE INDEX "pending_payments_from_user_id_idx" ON "pending_payments"("from_user_id");

-- CreateIndex
CREATE INDEX "pending_payments_to_phone_hash_idx" ON "pending_payments"("to_phone_hash");

-- CreateIndex
CREATE INDEX "pending_payments_status_idx" ON "pending_payments"("status");

-- CreateIndex
CREATE INDEX "pending_payments_expires_at_idx" ON "pending_payments"("expires_at");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_activity" ADD CONSTRAINT "weekly_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_payments" ADD CONSTRAINT "pending_payments_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_payments" ADD CONSTRAINT "pending_payments_claimed_by_user_id_fkey" FOREIGN KEY ("claimed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

