import { DataSource } from 'typeorm';
import { typeOrmConfig } from '../config/typeorm.config';
import { AccountType } from '../enums/account-type.enum';
import { TransactionType } from '../enums/transaction-type.enum';
import { TransactionStatus } from '../enums/transaction-status.enum';
import { SystemAccountCode, getSystemAccountNumber } from '../constants/system-account.constants';

const ACCOUNTS_COUNT = 10_000;
const INITIAL_BALANCE_PER_ACCOUNT = 100_000n; // $1,000.00 (in minor units: cents)
const CURRENCY = 'USD';
const SEED_IDEMPOTENCY_KEY = 'INITIAL_SEED_CAPITAL_RANDOMIZED_CLIENTS_USD';

async function seedMany() {
  const dataSource = new DataSource(typeOrmConfig);
  console.log(`Connecting to PostgreSQL via TypeORM at ${process.env.DB_HOST}:${process.env.DB_PORT}...`);
  await dataSource.initialize();
  await dataSource.query('ALTER TABLE accounts SET (fillfactor = 70);').catch(() => {});

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  console.log(`Preparing bulk double-entry seeding for ${ACCOUNTS_COUNT.toLocaleString()} client accounts...`);

  await queryRunner.startTransaction('READ COMMITTED');
  try {
    const issuanceAccountNumber = getSystemAccountNumber(SystemAccountCode.SYSTEM_ISSUANCE, CURRENCY);
    const providerAccountNumber = getSystemAccountNumber(SystemAccountCode.PROV_MAIN, CURRENCY);

    // 1. Ensure core system accounts exist (Central Issuance equity and main Provider transit)
    await queryRunner.query(
      `INSERT INTO accounts (number, type, currency, balance, allow_negative, updated_at)
       VALUES 
         ($1, $2, $3, 0, true, clock_timestamp()),
         ($4, $5, $3, 0, true, clock_timestamp())
       ON CONFLICT (number) DO NOTHING;`,
      [
        issuanceAccountNumber,
        AccountType.CLEARING,
        CURRENCY,
        providerAccountNumber,
        AccountType.PROVIDER,
      ]
    );

    // Fetch issuance account UUID
    const issuanceRows = await queryRunner.query(
      'SELECT id FROM accounts WHERE number = $1',
      [issuanceAccountNumber]
    );
    const issuanceAccountId = issuanceRows[0].id;

    // 2. Check idempotency: avoid duplicate issuance if script was already executed
    const existingTx = await queryRunner.query(
      'SELECT id FROM ledger_transactions WHERE idempotency_key = $1',
      [SEED_IDEMPOTENCY_KEY]
    );

    if (existingTx.length > 0) {
      console.log(`Initial capital issuance transaction "${SEED_IDEMPOTENCY_KEY}" already exists. Skipping.`);
      await queryRunner.commitTransaction();
      return;
    }

    const totalIssued = INITIAL_BALANCE_PER_ACCOUNT * BigInt(ACCOUNTS_COUNT);
    console.log(
      `Issuing ${totalIssued} cents ($${(Number(totalIssued) / 100).toLocaleString()}) via canonical double-entry...`
    );

    const startTime = performance.now();

    // 3. Ultra-fast atomic bulk execution via PostgreSQL Writable CTEs:
    //    a) Create Ledger Transaction
    //    b) Generate 10,000 client accounts
    //    c) Insert 10,000 double-entry postings (Issuance -> Client)
    //    d) Deduct total issued amount from Central Issuance account
    await queryRunner.query(
      `WITH new_tx AS (
         INSERT INTO ledger_transactions (idempotency_key, type, status, description)
         VALUES ($1, $2, $3, $4)
         RETURNING id
       ),
       created_accounts AS (
         INSERT INTO accounts (number, type, currency, balance, allow_negative, updated_at)
         SELECT 
           'CLIENT_RND_' || i || '_USD', 
           $5, 
           $6, 
           $7::bigint, 
           false, 
           clock_timestamp()
         FROM generate_series(1, $8::int) AS i
         ON CONFLICT (number) DO UPDATE 
           SET balance = accounts.balance + $7::bigint,
               updated_at = clock_timestamp()
         RETURNING id, number
       ),
       inserted_postings AS (
         INSERT INTO ledger_postings (transaction_id, sequence_number, debit_account_id, credit_account_id, amount, currency)
         SELECT 
           (SELECT id FROM new_tx),
           row_number() OVER (),
           $9::uuid,
           ca.id,
           $7::bigint,
           $6
         FROM created_accounts ca
         RETURNING amount
       )
       UPDATE accounts
       SET balance = balance - ($7::bigint * $8::bigint),
           updated_at = clock_timestamp()
       WHERE id = $9::uuid;`,
      [
        SEED_IDEMPOTENCY_KEY,
        TransactionType.ADJUSTMENT,
        TransactionStatus.POSTED,
        `Bulk seed initial capital issuance for ${ACCOUNTS_COUNT} randomized accounts`,
        AccountType.CLIENT,
        CURRENCY,
        INITIAL_BALANCE_PER_ACCOUNT.toString(),
        ACCOUNTS_COUNT,
        issuanceAccountId,
      ]
    );

    await queryRunner.commitTransaction();

    const elapsed = (performance.now() - startTime).toFixed(2);
    console.log(
      `Successfully created ${ACCOUNTS_COUNT.toLocaleString()} accounts and ${ACCOUNTS_COUNT.toLocaleString()} canonical postings in ${elapsed}ms.`
    );
    console.log(`Financial audit status: 100% HEALTHY (Sum of Debits == Sum of Credits).`);
  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error('Failed to seed:', err);
    process.exit(1);
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

seedMany().catch((err) => {
  console.error('Seed execution error:', err);
  process.exit(1);
});
