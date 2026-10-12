-- =========================================================================
-- Payment Core Ledger: Deferred Batch Processing Stored Procedure
-- =========================================================================

-- 1. Partial index for fast FIFO selection of pending transactions
CREATE INDEX IF NOT EXISTS idx_tx_processing 
ON ledger_transactions (created_at ASC, id ASC) 
WHERE status = 'PROCESSING';

-- 2. Stored procedure for batch processing
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
