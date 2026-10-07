import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';
import { LockedAccountRow } from './interfaces/locked-account-row.interface';
import { v4 as uuidv4 } from 'uuid';
import { AccountService } from './services/account.service';

/**
 * Isolated profiling script.
 * Simulates exactly what LedgerService does, but wraps every step in performance.now()
 * to profile database query times without polluting the production service.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const accountService = app.get(AccountService);

  console.log('Starting DB Profiler...');

  const accountIdsMap = await accountService.resolveAccountIds(['CLIENT_ALICE_USD', 'CLIENT_BOB_USD']);
  const alice = accountIdsMap.get('CLIENT_ALICE_USD')!;
  const bob = accountIdsMap.get('CLIENT_BOB_USD')!;

  const sortedAccountIds = [alice, bob].sort();
  const concurrency = 500;
  console.log(`Starting DB Profiler with ${concurrency} concurrent transactions...`);

  const promises = [];

  for (let i = 0; i < concurrency; i++) {
    const isEven = i % 2 === 0;
    const debit = isEven ? alice : bob;
    const credit = isEven ? bob : alice;
    
    promises.push(
      (async () => {
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction('READ COMMITTED');

        try {
          await queryRunner.query("SELECT set_config('lock_timeout', '2000ms', true)");

          const tLockStart = performance.now();
          const accounts: LockedAccountRow[] = [];
          for (const id of sortedAccountIds) {
            const rows = await queryRunner.query(
              `SELECT id, number, currency, balance, allow_negative 
               FROM accounts WHERE id = $1 FOR UPDATE`,
              [id]
            );
            if (rows.length > 0) accounts.push(rows[0]);
          }
          const tLockEnd = performance.now();

          const tInsertTxStart = performance.now();
          const txRows = await queryRunner.query(
            `INSERT INTO ledger_transactions (idempotency_key, type, status, description)
             VALUES ($1, $2, 'POSTED', $3) RETURNING id`,
            [uuidv4(), 'TRANSFER', `Profiler Test ${i}`]
          );
          const transactionId = txRows[0].id;
          const tInsertTxEnd = performance.now();

          const tInsertPostingsStart = performance.now();
          await queryRunner.query(
            `INSERT INTO ledger_postings (transaction_id, sequence_number, debit_account_id, credit_account_id, amount, currency)
             SELECT $1, * FROM UNNEST($2::int[], $3::uuid[], $4::uuid[], $5::bigint[], $6::varchar[])`,
            [transactionId, [1], [debit], [credit], ['1'], ['USD']]
          );
          const tInsertPostingsEnd = performance.now();

          const tUpdateAccountsStart = performance.now();
          await queryRunner.query(
            `UPDATE accounts AS a
             SET balance = a.balance + v.delta, updated_at = clock_timestamp()
             FROM (SELECT * FROM UNNEST($1::uuid[], $2::bigint[])) AS v(id, delta)
             WHERE a.id = v.id`,
            [[debit, credit], ['-1', '1']]
          );
          const tUpdateAccountsEnd = performance.now();

          const tCommitStart = performance.now();
          await queryRunner.commitTransaction();
          const tCommitEnd = performance.now();

          const timings = {
            lockMs: tLockEnd - tLockStart,
            insertTxMs: tInsertTxEnd - tInsertTxStart,
            insertPostingsMs: tInsertPostingsEnd - tInsertPostingsStart,
            updateAccountsMs: tUpdateAccountsEnd - tUpdateAccountsStart,
            commitMs: tCommitEnd - tCommitStart,
            totalMs: tCommitEnd - tLockStart,
          };

          if (timings.totalMs > 500) {
            console.warn(`[Slow Tx > 500ms] Lock: ${timings.lockMs.toFixed(2)}ms | InsTx: ${timings.insertTxMs.toFixed(2)}ms | InsPost: ${timings.insertPostingsMs.toFixed(2)}ms | UpdAcc: ${timings.updateAccountsMs.toFixed(2)}ms | Commit: ${timings.commitMs.toFixed(2)}ms | Total DB: ${timings.totalMs.toFixed(2)}ms`);
          }

        } catch (error) {
          await queryRunner.rollbackTransaction();
        } finally {
          await queryRunner.release();
        }
      })()
    );
  }

  await Promise.all(promises);
  console.log('\nProfiler benchmark complete.');
  await app.close();
}

bootstrap();
