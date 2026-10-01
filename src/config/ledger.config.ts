import { registerAs } from '@nestjs/config';

export interface LedgerConfig {
  revenueBucketsCount: number;
  defaultCurrency: string;
  lockTimeoutMs: number;
}

export const ledgerConfig = registerAs(
  'ledger',
  (): LedgerConfig => ({
    revenueBucketsCount: Number(process.env.REVENUE_BUCKETS_COUNT)!,
    defaultCurrency: process.env.DEFAULT_CURRENCY!,
    lockTimeoutMs: Number(process.env.LOCK_TIMEOUT_MS)!,
  }),
);
