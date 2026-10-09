# Payment Core Ledger

High-performance double-entry bookkeeping ledger core.

## Performance Benchmark

Results of the production `LedgerService` benchmark with Selective & Deterministic Locking, Heap-Only Tuple (`fillfactor = 70`), and pool-level lock timeout:

- **Concurrency:** 500 parallel transactions
- **Load Distribution:** 80% sparse accounts, 20% hot accounts (`PROV_MAIN_USD`)
- **Success Rate:** 100% (500/500, 0 Deadlocks, 0 Errors)
- **Real TPS:** 581 tx/s
- **Wall-Clock Time:** 859.5 ms
- **Latency (p50):** 506.3 ms
- **Latency (p90):** 736.3 ms
- **Latency (p99):** 848.0 ms
- **Latency (Max):** 853.7 ms
- **Hot Account (`PROV_MAIN_USD`):** 103 tx, Avg Latency: 675.68 ms, Max Latency: 853.67 ms

### High-Contention Benchmark (2 Accounts Only — HTTP API)

When testing extreme contention where all 500 parallel transactions hit the exact same two accounts simultaneously (`Alice` ↔ `Bob`) via HTTP:
- **Success Rate:** 100% (500/500, 0 deadlocks/timeouts, 0 other errors)
- **Latencies (ms):** Avg: 822.9 ms | p50: 835.1 ms | p90: 1393.0 ms | p99: 1520.1 ms | Max: 1530.0 ms

## Quick Start

1. Install dependencies:
```bash
bun install
```

2. Start PostgreSQL:
```bash
docker-compose up -d
```

3. Seed standard domain accounts and 10,000 randomized test accounts:
```bash
bun run src/database/seed.ts
bun run src/database/seed-many.ts
```

4. Run the Hot Accounts performance benchmark:
```bash
bun run src/ledger.benchmark.many.ts
```

5. Start the API server (Swagger UI at `http://localhost:3000/api/docs`):
```bash
bun run start:dev
```
