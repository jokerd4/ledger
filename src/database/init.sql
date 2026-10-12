-- =========================================================================
-- Payment Core Ledger: Initial Database Schema, Indices and Stored Procedures
-- Executed on container initialization via /docker-entrypoint-initdb.d/
-- =========================================================================

-- 1. Accounts Table
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number VARCHAR(64) UNIQUE NOT NULL,
    type VARCHAR(32) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    balance BIGINT NOT NULL DEFAULT 0,
    allow_negative BOOLEAN NOT NULL DEFAULT false,
    bucket_group VARCHAR(32),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_account_balance CHECK (balance >= 0 OR allow_negative = true)
);

ALTER TABLE accounts SET (fillfactor = 70);

CREATE INDEX IF NOT EXISTS idx_accounts_bucket_group ON accounts (bucket_group);
CREATE INDEX IF NOT EXISTS idx_accounts_type_currency ON accounts (type, currency);

-- 2. Ledger Transactions Table
CREATE TABLE IF NOT EXISTS ledger_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    type VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PROCESSING',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_idempotency ON ledger_transactions (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_tx_created_at ON ledger_transactions (created_at);

-- Partial index for fast FIFO batch retrieval
CREATE INDEX IF NOT EXISTS idx_tx_processing 
ON ledger_transactions (created_at ASC, id ASC) 
WHERE status = 'PROCESSING';

-- 3. Ledger Postings Table (Append-Only)
CREATE TABLE IF NOT EXISTS ledger_postings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES ledger_transactions(id),
    sequence_number INT NOT NULL,
    debit_account_id UUID NOT NULL REFERENCES accounts(id),
    credit_account_id UUID NOT NULL REFERENCES accounts(id),
    amount BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_different_accounts CHECK (debit_account_id != credit_account_id),
    CONSTRAINT chk_posting_amount_positive CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_postings_tx_id ON ledger_postings (transaction_id);
CREATE INDEX IF NOT EXISTS idx_postings_debit_acc ON ledger_postings (debit_account_id);
CREATE INDEX IF NOT EXISTS idx_postings_credit_acc ON ledger_postings (credit_account_id);
CREATE INDEX IF NOT EXISTS idx_postings_created_at ON ledger_postings (created_at);

-- 4. Stored Procedure for Deferred Batch Processing
CREATE OR REPLACE FUNCTION process_pending_ledger_transactions(p_batch_size INT DEFAULT 1000)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    r_tx RECORD;
    r_post RECORD;
    v_new_debit_balance BIGINT;
    v_new_credit_balance BIGINT;
    v_count INT := 0;
BEGIN
    -- 0. Advisory lock: ensure only one worker executes at any given time
    IF NOT pg_try_advisory_xact_lock(424242) THEN
        RETURN 0;
    END IF;

    -- 1. Loop through batch of pending transactions in strict chronological order
    FOR r_tx IN
        SELECT id 
        FROM ledger_transactions
        WHERE status = 'PROCESSING'
        ORDER BY created_at ASC, id ASC
        LIMIT p_batch_size
    LOOP
        BEGIN
            -- 2. Process double-entry postings for this transaction
            FOR r_post IN
                SELECT debit_account_id, credit_account_id, amount
                FROM ledger_postings
                WHERE transaction_id = r_tx.id
                ORDER BY sequence_number ASC
            LOOP
                -- Deduct from debit account and get new balance via RETURNING
                UPDATE accounts
                SET balance = balance - r_post.amount,
                    updated_at = CLOCK_TIMESTAMP()
                WHERE id = r_post.debit_account_id
                RETURNING balance INTO v_new_debit_balance;

                -- Credit to credit account and get new balance via RETURNING
                UPDATE accounts
                SET balance = balance + r_post.amount,
                    updated_at = CLOCK_TIMESTAMP()
                WHERE id = r_post.credit_account_id
                RETURNING balance INTO v_new_credit_balance;
            END LOOP;

            -- 3. Mark transaction as POSTED
            UPDATE ledger_transactions
            SET status = 'POSTED'
            WHERE id = r_tx.id;

            v_count := v_count + 1;
        EXCEPTION WHEN check_violation THEN
            -- Overdraft check constraint failed (balance < 0 and allow_negative = false)
            UPDATE ledger_transactions
            SET status = 'REJECTED'
            WHERE id = r_tx.id;

            v_count := v_count + 1;
        END;
    END LOOP;

    RETURN v_count;
END;
$$;
