import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';
import { LedgerService } from './services/ledger.service';
import { SystemAccountCode, getSystemAccountNumber } from './constants/system-account.constants';
import { v4 as uuidv4 } from 'uuid';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const ledgerService = app.get(LedgerService);

  console.log('Starting Production LedgerService Benchmark (Selective Locking Enabled)...');

  const hotAccountNumber = getSystemAccountNumber(SystemAccountCode.PROV_MAIN, 'USD');

  // 1. Load Hot System Account (Provider)
  const provRows = await dataSource.query(
    'SELECT id, number FROM accounts WHERE number = $1',
    [hotAccountNumber]
  );
  if (provRows.length === 0) {
    console.error(`Hot account "${hotAccountNumber}" not found. Please run seed script first.`);
    process.exit(1);
  }
  const providerId = provRows[0].id;
  const providerNumber = provRows[0].number;

  // 2. Load Sparse Client Accounts
  const clientRows = await dataSource.query(
    "SELECT id, number FROM accounts WHERE number LIKE 'CLIENT_RND_%' LIMIT 1000;"
  );
  if (clientRows.length < 2) {
    console.error('Not enough accounts found. Please run "bun run src/database/seed-many.ts" first.');
    process.exit(1);
  }

  const clientMap = new Map<string, string>(); // id -> number
  const clientIds = clientRows.map((r: { id: string; number: string }) => {
    clientMap.set(r.id, r.number);
    return r.id;
  });

  clientMap.set(providerId, providerNumber);

  const concurrency = 500;
  console.log(
    `Executing ${concurrency} concurrent transfers via LedgerService. 20% involve the HOT ACCOUNT (${providerNumber})...\n`
  );

  const promises = [];
  const globalStart = performance.now();

  for (let i = 0; i < concurrency; i++) {
    // 20% of traffic goes through the Hot Account (Provider)
    const isHotTx = Math.random() < 0.2;

    let aIdx = Math.floor(Math.random() * clientIds.length);
    let bIdx = Math.floor(Math.random() * clientIds.length);
    while (aIdx === bIdx) bIdx = Math.floor(Math.random() * clientIds.length);

    const debit = isHotTx ? providerId : clientIds[aIdx];
    const credit = clientIds[bIdx];

    promises.push(
      (async () => {
        const txStart = performance.now();
        try {
          const result = await ledgerService.executeTransaction({
            idempotencyKey: uuidv4(),
            transactionType: 'TRANSFER',
            postings: [
              {
                sequenceNumber: 1,
                debitAccountId: debit,
                creditAccountId: credit,
                amount: 1n,
                currency: 'USD',
              },
            ],
            description: `Benchmark transfer #${i}`,
          });
          const txEnd = performance.now();

          return {
            error: null,
            accountsInvolved: [debit, credit],
            latencyMs: txEnd - txStart,
            result,
          };
        } catch (error) {
          const txEnd = performance.now();
          return {
            error,
            accountsInvolved: [debit, credit],
            latencyMs: txEnd - txStart,
            result: null,
          };
        }
      })()
    );
  }

  const results = await Promise.all(promises);
  const globalEnd = performance.now();

  const validResults = results.filter((r) => !r.error);
  const errorResults = results.filter((r) => r.error);

  console.log(`Results: ${validResults.length} success, ${errorResults.length} errors`);

  if (errorResults.length > 0) {
    const errorMessages = new Map<string, number>();
    for (const r of errorResults) {
      const msg = (r.error as any)?.message || String(r.error);
      errorMessages.set(msg, (errorMessages.get(msg) || 0) + 1);
    }
    console.log('Error Breakdown:');
    for (const [msg, count] of errorMessages) {
      console.log(`  - ${count}x: ${msg}`);
    }
  }

  if (validResults.length > 0) {
    // Collect Per-Account Traffic Analytics
    const accountAnalytics = new Map<string, { count: number; totalLatencyMs: number; maxLatencyMs: number }>();

    for (const r of validResults) {
      for (const accId of r.accountsInvolved) {
        if (!accountAnalytics.has(accId)) {
          accountAnalytics.set(accId, { count: 0, totalLatencyMs: 0, maxLatencyMs: 0 });
        }
        const stats = accountAnalytics.get(accId)!;
        stats.count++;
        stats.totalLatencyMs += r.latencyMs;
        if (r.latencyMs > stats.maxLatencyMs) stats.maxLatencyMs = r.latencyMs;
      }
    }

    // Sort accounts by usage count (descending)
    const sortedAnalytics = Array.from(accountAnalytics.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    console.log('\n--- TOP 10 ACCOUNTS BY TRAFFIC ---');
    console.table(
      sortedAnalytics.map(([id, stats]) => ({
        Account: clientMap.get(id),
        Tx_Count: stats.count,
        Avg_Latency_ms: (stats.totalLatencyMs / stats.count).toFixed(2),
        Max_Latency_ms: stats.maxLatencyMs.toFixed(2),
      }))
    );

    const latencies = validResults.map((r) => r.latencyMs).sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)]!;
    const p90 = latencies[Math.floor(latencies.length * 0.9)]!;
    const p99 = latencies[Math.floor(latencies.length * 0.99)]!;
    const max = latencies[latencies.length - 1]!;

    const wallClockMs = globalEnd - globalStart;
    const realTps = Math.floor((validResults.length / wallClockMs) * 1000);

    console.log(
      `\nGlobal Latency (ms): p50: ${p50.toFixed(1)} | p90: ${p90.toFixed(1)} | p99: ${p99.toFixed(1)} | Max: ${max.toFixed(1)}`
    );
    console.log(`Total Wall-Clock Time: ${wallClockMs.toFixed(1)} ms`);
    console.log(`Real TPS: ${realTps} tx/s`);
  }

  await app.close();
}

bootstrap();
