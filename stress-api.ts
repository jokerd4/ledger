import { v4 as uuidv4 } from 'uuid';

async function bootstrap() {
  console.log('Starting API stress test...');
  
  // We need two accounts, Alice and Bob, which are seeded.
  // Wait, I can't resolve UUIDs if I don't hit the DB directly, but the API accepts account strings maybe?
  // Let's check LedgerController or just assume string IDs work.
  // We know the API is running on localhost:3000
  const url = 'http://localhost:3000/api/ledger/transactions';
  
  const concurrency = 500;
  const promises = [];

  for (let i = 0; i < concurrency; i++) {
    const isEven = i % 2 === 0;
    const debit = isEven ? 'CLIENT_ALICE_USD' : 'CLIENT_BOB_USD';
    const credit = isEven ? 'CLIENT_BOB_USD' : 'CLIENT_ALICE_USD';

    const payload = {
      idempotencyKey: uuidv4(),
      transactionType: 'TRANSFER',
      postings: [
        {
          sequenceNumber: 1,
          debitAccountId: debit,
          creditAccountId: credit,
          amount: 1,
          currency: 'USD',
        }
      ]
    };

    const start = performance.now();
    promises.push(
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(async res => {
        const end = performance.now();
        const text = await res.text();
        return { status: res.status, text, latency: end - start };
      })
      .catch(e => {
        const end = performance.now();
        return { status: 500, text: e.message, latency: end - start };
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
    if (res.status === 200 || res.status === 201) {
      success++;
    } else if (res.text.includes('deadlock')) {
      deadlocks++;
    } else if (res.text.includes('timeout') || res.status === 409) {
      deadlocks++; 
    } else {
      console.log('Error:', res.status, res.text);
      otherErrors++;
    }
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.50)];
  const p90 = latencies[Math.floor(latencies.length * 0.90)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const max = latencies[latencies.length - 1];
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  console.log(`Results: ${success} success, ${deadlocks} deadlocks/timeouts, ${otherErrors} other errors`);
  console.log(`Latencies (ms): Avg: ${avg.toFixed(1)} | p50: ${p50.toFixed(1)} | p90: ${p90.toFixed(1)} | p99: ${p99.toFixed(1)} | Max: ${max.toFixed(1)}`);

  console.log('Running audit...');
  const reconcileRes = await fetch('http://localhost:3000/api/ledger/reconcile');
  const auditResult = await reconcileRes.json();
  console.log('Audit Result:', JSON.stringify(auditResult, null, 2));
}

bootstrap();
