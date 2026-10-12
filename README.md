# Payment Core Ledger

High-performance double-entry bookkeeping ledger core.

## Performance Benchmark

- **Duration:** 300.45 s (5-minute sustained endurance run)
- **Concurrency:** 1,000 parallel workers in flight
- **Traffic Distribution:** 80% sparse accounts, 20% hot account (`PROV_MAIN_USD`)
- **Total Transactions:** 523,466
- **Success Rate:** 100% (523,466 success, 0 errors, 0 deadlocks)
- **Real Sustained TPS:** 1,742 tx/s
- **Global Latency:**
  - **p50:** 554.4 ms
  - **p90:** 641.7 ms
  - **p99:** 959.0 ms
  - **Max:** 1,254.4 ms
- **Hot Account (`PROV_MAIN_USD`):** 104,718 tx, Avg Latency: 576.86 ms, Max Latency: 1,254.44 ms

---

## Quick Start

1. Install dependencies:
```bash
bun install
```

2. Start PostgreSQL:
```bash
bun run db:up
```

3. Seed system domain accounts and test client accounts:
```bash
bun run seed
bun run src/database/seed-many.ts
```

4. Start background transaction worker:
```bash
bun run start:worker:dev
```

5. Start API server (Swagger UI at `http://localhost:3000/api/docs`):
```bash
bun run start:dev
```

6. Run sustained endurance benchmark (5 minutes, 1,000 workers):
```bash
bun run src/ledger.benchmark.many.ts 300 1000
```
