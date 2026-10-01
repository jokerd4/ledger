import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { REVENUE_BUCKET_GROUP } from '../constants/ledger.constants';
import type { LedgerConfig } from '../config/ledger.config';

@Injectable()
export class AccountBucketingService {
  private readonly logger = new Logger(AccountBucketingService.name);
  private readonly defaultBucketCount: number;
  private readonly bucketCache = new Map<string, string>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    this.defaultBucketCount = this.configService.get<LedgerConfig>('ledger')!.revenueBucketsCount;
  }

  // Deterministically distributes revenue postings across shards based on idempotency key hash.
  async getRevenueBucketAccountId(currency: string, idempotencyKey: string): Promise<string> {
    const hash = crypto.createHash('md5').update(idempotencyKey).digest();
    const bucketIndex = (hash.readUInt32BE(0) % this.defaultBucketCount) + 1;
    const bucketNumber = `REVENUE_${currency.toUpperCase()}_${String(bucketIndex).padStart(2, '0')}`;

    if (this.bucketCache.has(bucketNumber)) {
      return this.bucketCache.get(bucketNumber)!;
    }

    const rows = await this.dataSource.query(
      'SELECT id FROM accounts WHERE number = $1',
      [bucketNumber]
    );

    if (rows.length === 0) {
      throw new InternalServerErrorException(
        `Revenue bucket account ${bucketNumber} not found in database. Please run seed script.`
      );
    }

    const accountId = rows[0].id;
    this.bucketCache.set(bucketNumber, accountId);
    return accountId;
  }

  // Calculates total consolidated balance across all shard accounts in a bucket group.
  async getConsolidatedGroupBalance(bucketGroup: string = REVENUE_BUCKET_GROUP): Promise<{ totalBalance: bigint; count: number }> {
    const rows = await this.dataSource.query(
      `SELECT 
         COALESCE(SUM(balance), 0)::text AS total_balance,
         COUNT(*)::int AS count
       FROM accounts 
       WHERE bucket_group = $1`,
      [bucketGroup]
    );

    return {
      totalBalance: BigInt(rows[0].total_balance || '0'),
      count: parseInt(rows[0].count, 10),
    };
  }
}
