import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';
import { LedgerService } from './services/ledger.service';
import { SystemAccountCode, getSystemAccountNumber } from './constants/system-account.constants';
import { v4 as uuidv4 } from 'uuid';

/**
 * Sustained / Endurance Load Benchmark for LedgerService.
 *
 * Configurable duration (e.g. 60s, 120s) with a fixed concurrency worker pool.
 * Simulates continuous real-world traffic over time rather than a single instantaneous burst.
 *
 * Usage:
 *   bun run src/ledger.benchmark.many.ts             # Default: 60 seconds, 50 workers
 *   bun run src/ledger.benchmark.many.ts 120         # 120 seconds (2 minutes), 50 workers
 *   bun run src/ledger.benchmark.many.ts 60 100      # 60 seconds, 100 workers
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const dataSource = app.get(DataSource);
  const ledgerService = app.get(LedgerService);

  // 1. Duration & Concurrency Configuration
  const durationArg = process.argv[2] ? parseInt(process.argv[2], 10) : undefined;
  const concurrencyArg = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;

  const DURATION_SECONDS = durationArg && !isNaN(durationArg) ? durationArg : 60; // 60 seconds default (1 min)
  const CONCURRENCY_WORKERS = concurrencyArg && !isNaN(concurrencyArg) ? concurrencyArg : 50; // 50 parallel workers

  const hotAccountNumber = getSystemAccountNumber(SystemAccountCode.PROV_MAIN, 'USD');

  console.log('========================================================================');
  console.log('Starting Sustained Production LedgerService Benchmark (Endurance Test)');
  console.log(`Duration:    ${DURATION_SECONDS} seconds (${(DURATION_SECONDS / 60).toFixed(1)} min)`);
  console.log(`Concurrency: ${CONCURRENCY_WORKERS} parallel workers in flight`);
  console.log(`Traffic:     80% sparse client accounts, 20% hot account (${hotAccountNumber})`);
  console.log('========================================================================\n');

  // 2. Load Hot System Account (Provider)
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

  // 3. Load Sparse Client Accounts
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

  // Telemetry & Metrics state
  const latencies: number[] = [];
  const accountAnalytics = new Map<string, { count: number; totalLatencyMs: number; maxLatencyMs: number }>();
  const errorMessages = new Map<string, number>();

  let totalSuccess = 0;
  let totalErrors = 0;
  let txCounter = 0;

  const globalStart = performance.now();
  const endTime = globalStart + DURATION_SECONDS * 1000;

  // Live progress ticker every 5 seconds
  let lastReportTime = globalStart;
  let lastReportSuccess = 0;

  const progressInterval = setInterval(() => {
    const now = performance.now();
    const elapsedSec = ((now - globalStart) / 1000).toFixed(1);
    const deltaSec = (now - lastReportTime) / 1000;
    const deltaSuccess = totalSuccess - lastReportSuccess;
    const currentTps = deltaSec > 0 ? Math.floor(deltaSuccess / deltaSec) : 0;

    console.log(
      `[${elapsedSec}s / ${DURATION_SECONDS}s] Completed: ${totalSuccess + totalErrors} tx | ` +
      `Live TPS: ${currentTps} tx/s | Success: ${totalSuccess} | Errors: ${totalErrors}`
    );

    lastReportTime = now;
    lastReportSuccess = totalSuccess;
  }, 5000);

  // Worker task: keeps sending requests continuously until time runs out
  async function runWorker(workerId: number) {
    while (performance.now() < endTime) {
      const currentTxIndex = ++txCounter;

      // 20% of traffic goes through the Hot Account (Provider)
      const isHotTx = Math.random() < 0.2;

      let aIdx = Math.floor(Math.random() * clientIds.length);
      let bIdx = Math.floor(Math.random() * clientIds.length);
      while (aIdx === bIdx) bIdx = Math.floor(Math.random() * clientIds.length);

      const debit = isHotTx ? providerId : clientIds[aIdx];
      const credit = clientIds[bIdx];

      const txStart = performance.now();
      try {
        await ledgerService.executeTransaction({
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
          description: `Sustained benchmark tx #${currentTxIndex}`,
        });
        const txEnd = performance.now();
        const durationMs = txEnd - txStart;

        latencies.push(durationMs);
        totalSuccess++;

        // Track per-account stats
        for (const accId of [debit, credit]) {
          let stat = accountAnalytics.get(accId);
          if (!stat) {
            stat = { count: 0, totalLatencyMs: 0, maxLatencyMs: 0 };
            accountAnalytics.set(accId, stat);
          }
          stat.count++;
          stat.totalLatencyMs += durationMs;
          if (durationMs > stat.maxLatencyMs) {
            stat.maxLatencyMs = durationMs;
          }
        }
      } catch (error: any) {
        totalErrors++;
        const msg = error?.message || String(error);
        errorMessages.set(msg, (errorMessages.get(msg) || 0) + 1);
      }
    }
  }

  // Launch worker pool
  console.log(`Starting ${CONCURRENCY_WORKERS} workers... Test in progress...\n`);
  const workers = Array.from({ length: CONCURRENCY_WORKERS }, (_, i) => runWorker(i + 1));
  await Promise.all(workers);

  clearInterval(progressInterval);
  const globalEnd = performance.now();
  const wallClockMs = globalEnd - globalStart;
  const realTps = wallClockMs > 0 ? Math.floor((totalSuccess / wallClockMs) * 1000) : 0;

  console.log('\n========================================================================');
  console.log('BENCHMARK FINISHED');
  console.log(`Results: ${totalSuccess} success, ${totalErrors} errors`);
  console.log('========================================================================');

  if (totalErrors > 0) {
    console.log('\nError Breakdown:');
    for (const [msg, count] of errorMessages) {
      console.log(`  - ${count}x: ${msg}`);
    }
  }

  if (totalSuccess > 0) {
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

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)]!;
    const p90 = latencies[Math.floor(latencies.length * 0.9)]!;
    const p99 = latencies[Math.floor(latencies.length * 0.99)]!;
    const max = latencies[latencies.length - 1]!;

    console.log(
      `\nGlobal Latency (ms): p50: ${p50.toFixed(1)} | p90: ${p90.toFixed(1)} | p99: ${p99.toFixed(1)} | Max: ${max.toFixed(1)}`
    );
    console.log(`Total Wall-Clock Time: ${(wallClockMs / 1000).toFixed(2)} s (${wallClockMs.toFixed(1)} ms)`);
    console.log(`Real Sustained TPS: ${realTps} tx/s`);
  }

  await app.close();
}

bootstrap();
