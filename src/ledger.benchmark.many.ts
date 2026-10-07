import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';
import { LockedAccountRow } from './interfaces/locked-account-row.interface';
import { v4 as uuidv4 } from 'uuid';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  console.log('Starting Hot Account Analytics Profiler...');

  // 1. Load System Account (The "Hot Account")
  const provRows = await dataSource.query(`SELECT id, number FROM accounts WHERE number = 'PROV_MAIN_USD'`);
  if (provRows.length === 0) {
    console.error('PROV_MAIN_USD not found');
    process.exit(1);
  }
  const providerId = provRows[0].id;
  const providerNumber = provRows[0].number;

  // 2. Load Sparse Client Accounts
  const clientRows = await dataSource.query(`SELECT id, number FROM accounts WHERE number LIKE 'CLIENT_RND_%' LIMIT 1000;`);
  if (clientRows.length < 2) {
    console.error('Not enough accounts found. Please run "bun run src/database/seed-many.ts" first.');
    process.exit(1);
  }
  
  const clientMap = new Map<string, string>(); // id -> number
  const clientIds = clientRows.map((r: { id: string, number: string }) => {
    clientMap.set(r.id, r.number);
    return r.id;
  });
  
  clientMap.set(providerId, providerNumber);

  const concurrency = 500;
  console.log(`Executing ${concurrency} concurrent transfers. 20% involve the HOT ACCOUNT (${providerNumber})...`);

  const promises = [];
  const globalStart = performance.now();

  for (let i = 0; i < concurrency; i++) {
    // 20% of traffic goes through the Hot Account (Provider)
    const isHotTx = Math.random() < 0.20; 
    
    let aIdx = Math.floor(Math.random() * clientIds.length);
    let bIdx = Math.floor(Math.random() * clientIds.length);
    while (aIdx === bIdx) bIdx = Math.floor(Math.random() * clientIds.length);

    const debit = isHotTx ? providerId : clientIds[aIdx];
    const credit = clientIds[bIdx];
    const sortedAccountIds = [debit, credit].sort();
    
    promises.push(
      (async () => {
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction('READ COMMITTED');

        try {
          await queryRunner.query("SELECT set_config('lock_timeout', '5000ms', true)");

          const tLockStart = performance.now();
          const accounts: LockedAccountRow[] = [];
          for (const id of sortedAccountIds) {
            const res = await queryRunner.query(
              `SELECT id, number, currency, balance, allow_negative 
               FROM accounts WHERE id = $1 FOR UPDATE`,
              [id]
            );
            if (res.length > 0) accounts.push(res[0]);
          }
          const tLockEnd = performance.now();

          const tInsertTxStart = performance.now();
          const txRows = await queryRunner.query(
            `INSERT INTO ledger_transactions (idempotency_key, type, status, description)
             VALUES ($1, $2, 'POSTED', $3) RETURNING id`,
            [uuidv4(), 'TRANSFER', `Profiler Hot ${i}`]
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

          return {
            error: null,
            accountsInvolved: [debit, credit],
            lockMs: tLockEnd - tLockStart,
            totalMs: tCommitEnd - tLockStart
          };
        } catch (error) {
          await queryRunner.rollbackTransaction();
          return { error };
        } finally {
          await queryRunner.release();
        }
      })()
    );
  }

  const results = await Promise.all(promises);
  const globalEnd = performance.now();

  const validResults = results.filter(r => !r.error) as Array<{
    error: null;
    accountsInvolved: string[];
    lockMs: number;
    totalMs: number;
  }>;
  const errors = results.filter(r => r.error).length;

  console.log(`\nResults: ${validResults.length} success, ${errors} errors`);
  
  if (validResults.length > 0) {
    // Collect Analytics
    const accountAnalytics = new Map<string, { count: number, totalLockMs: number, maxLockMs: number }>();
    
    for (const r of validResults) {
      for (const accId of r.accountsInvolved) {
        if (!accountAnalytics.has(accId)) {
          accountAnalytics.set(accId, { count: 0, totalLockMs: 0, maxLockMs: 0 });
        }
        const stats = accountAnalytics.get(accId)!;
        stats.count++;
        stats.totalLockMs += r.lockMs;
        if (r.lockMs > stats.maxLockMs) stats.maxLockMs = r.lockMs;
      }
    }

    // Sort accounts by usage count (descending)
    const sortedAnalytics = Array.from(accountAnalytics.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10); // Show top 10

    console.log('\n--- TOP 10 ACCOUNTS BY TRAFFIC ---');
    console.table(sortedAnalytics.map(([id, stats]) => ({
      Account: clientMap.get(id),
      Tx_Count: stats.count,
      Avg_Lock_Wait_ms: (stats.totalLockMs / stats.count).toFixed(2),
      Max_Lock_Wait_ms: stats.maxLockMs.toFixed(2),
    })));

    const latencies = validResults.map(r => r.totalMs).sort((a, b) => a! - b!);
    const p50 = latencies[Math.floor(latencies.length * 0.50)]!;
    const p90 = latencies[Math.floor(latencies.length * 0.90)]!;
    const p99 = latencies[Math.floor(latencies.length * 0.99)]!;
    const max = latencies[latencies.length - 1]!;
    
    console.log(`\nGlobal DB Latency (ms): p50: ${p50.toFixed(1)} | p90: ${p90.toFixed(1)} | p99: ${p99.toFixed(1)} | Max: ${max.toFixed(1)}`);
    console.log(`Total Wall-Clock Time: ${(globalEnd - globalStart).toFixed(1)} ms`);
    console.log(`Real TPS: ${Math.floor((validResults.length / (globalEnd - globalStart)) * 1000)} tx/s`);
  }

  await app.close();
}

bootstrap();
