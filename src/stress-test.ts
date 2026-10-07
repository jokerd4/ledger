import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PaymentService } from './services/payment.service';
import { AccountService } from './services/account.service';
import { LedgerService } from './services/ledger.service';
import { ReconciliationService } from './services/reconciliation.service';
import { v4 as uuidv4 } from 'uuid';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const paymentService = app.get(PaymentService);
  const accountService = app.get(AccountService);

  console.log('Starting deadlock stress test...');
  
  // We need some accounts. We can use the seeded accounts.
  // We need to simulate A -> B and B -> A concurrently.
  // Wait, PayIn and PayOut use predefined accounts.
  // Let's use simple generic transactions, or we can use PaymentService.executePayIn?
  // Let's use LedgerService directly for A->B and B->A.
  const ledgerService = app.get(LedgerService);

  // Find two client accounts
  const accountIds = await accountService.resolveAccountIds(['CLIENT_ALICE_USD', 'CLIENT_BOB_USD']);
  const alice = accountIds.get('CLIENT_ALICE_USD');
  const bob = accountIds.get('CLIENT_BOB_USD');

  if (!alice || !bob) {
    console.error('Alice or Bob account not found');
    process.exit(1);
  }

  const concurrency = 500;
  const promises = [];

  for (let i = 0; i < concurrency; i++) {
    // Even transactions: Alice -> Bob
    // Odd transactions: Bob -> Alice
    const isEven = i % 2 === 0;
    const debit = isEven ? alice : bob;
    const credit = isEven ? bob : alice;

    const start = performance.now();
    promises.push(
      ledgerService.executeTransaction({
        idempotencyKey: uuidv4(),
        transactionType: 'TRANSFER',
        postings: [
          {
            sequenceNumber: 1,
            debitAccountId: debit,
            creditAccountId: credit,
            amount: 1n,
            currency: 'USD',
          }
        ]
      }).then(res => {
        const end = performance.now();
        return { result: res, latency: end - start, error: null };
      }).catch(e => {
        const end = performance.now();
        return { result: null, latency: end - start, error: e };
      })
    );
  }

  const results = await Promise.all(promises);
  let deadlocks = 0;
  let success = 0;
  let otherErrors = 0;
  const latencies: number[] = [];

  for (const res of results) {
    latencies.push(res.latency);
    if (res.error) {
      if (res.error.message.includes('deadlock')) {
        deadlocks++;
      } else if (res.error.message.includes('timeout')) {
        otherErrors++;
      } else {
        console.error(res.error);
        otherErrors++;
      }
    } else {
      success++;
    }
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.50)];
  const p90 = latencies[Math.floor(latencies.length * 0.90)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const max = latencies[latencies.length - 1];
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  console.log(`Results: ${success} success, ${deadlocks} deadlocks, ${otherErrors} other errors`);
  console.log(`Latencies (ms): Avg: ${avg.toFixed(1)} | p50: ${p50.toFixed(1)} | p90: ${p90.toFixed(1)} | p99: ${p99.toFixed(1)} | Max: ${max.toFixed(1)}`);

  console.log('\nRunning audit...');
  const reconciliationService = app.get(ReconciliationService);
  const auditResult = await reconciliationService.runAudit();
  console.log('Audit Result:', JSON.stringify(auditResult, null, 2));

  await app.close();
}

bootstrap();
