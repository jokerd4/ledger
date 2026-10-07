# Payment Core Ledger

High-performance double-entry bookkeeping ledger core.

## Performance Benchmark

- **Concurrency:** 500 parallel transactions
- **Load Distribution:** 80% sparse accounts, 20% hot accounts (`PROV_MAIN_USD`)
- **Success Rate:** 100% (0 Deadlocks)
- **Real TPS:** 615 tx/s
- **Latency (p50):** 37.3 ms
- **Latency (Max):** 514.4 ms (Hot account lock queue wait)

### High-Contention Benchmark (2 Accounts Only)

When testing extreme contention where all 500 parallel transactions hit the exact same two accounts simultaneously:
- **Lock Wait Time:** Up to 2,133 ms
- **Database Total Tx Time:** Heavily dominated by Row-Level Locks (>99% of tx time)
- **Deadlocks:** 0 (Deterministic sort completely prevents circular locks)

## Quick Start

1. Install dependencies:
```bash
bun install
```

2. Start PostgreSQL:
```bash
docker-compose up -d
```

3. Seed 10,000 randomized test accounts:
```bash
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
