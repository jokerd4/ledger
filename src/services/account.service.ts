import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountBucketingService } from './account-bucketing.service';
import { IAccountResponse } from '../interfaces/account-response.interface';
import { IAccountStatementItem } from '../interfaces/account-statement-item.interface';
import { DEFAULT_STATEMENT_LIMIT } from '../constants/ledger.constants';

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);
  private readonly accountIdCache = new Map<string, string>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly bucketingService: AccountBucketingService,
  ) {}

  isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  // Resolves single account ID or number with in-memory caching.
  async resolveAccountId(idOrNumber: string): Promise<string> {
    if (this.isUuid(idOrNumber)) {
      return idOrNumber;
    }
    const cached = this.accountIdCache.get(idOrNumber);
    if (cached) {
      return cached;
    }
    const rows = await this.dataSource.query('SELECT id FROM accounts WHERE number = $1', [idOrNumber]);
    if (rows.length === 0) {
      throw new BadRequestException(`Account "${idOrNumber}" not found in database`);
    }
    
    if (this.accountIdCache.size >= 10000) {
      this.logger.warn('accountIdCache exceeded 10000 items and was cleared to prevent memory leak');
      this.accountIdCache.clear();
    }
    this.accountIdCache.set(idOrNumber, rows[0].id);
    
    return rows[0].id;
  }

  // Resolves a batch of account numbers or UUIDs in a single SQL query with in-memory cache lookup.
  async resolveAccountIds(identifiers: string[]): Promise<Map<string, string>> {
    const resolvedMap = new Map<string, string>();
    const missing: string[] = [];

    for (const idOrNumber of identifiers) {
      if (this.isUuid(idOrNumber)) {
        resolvedMap.set(idOrNumber, idOrNumber);
      } else {
        const cached = this.accountIdCache.get(idOrNumber);
        if (cached) {
          resolvedMap.set(idOrNumber, cached);
        } else {
          missing.push(idOrNumber);
        }
      }
    }

    if (missing.length > 0) {
      const distinctMissing = Array.from(new Set(missing));
      const rows = await this.dataSource.query(
        'SELECT id, number FROM accounts WHERE number = ANY($1::varchar[])',
        [distinctMissing]
      );
      
      for (const r of rows) {
        resolvedMap.set(r.number, r.id);
        
        if (this.accountIdCache.size >= 10000) {
          this.logger.warn('accountIdCache exceeded 10000 items and was cleared to prevent memory leak');
          this.accountIdCache.clear();
        }
        this.accountIdCache.set(r.number, r.id);
      }
      
      for (const num of distinctMissing) {
        if (!resolvedMap.has(num)) {
          throw new BadRequestException(`Account "${num}" not found in database`);
        }
      }
    }

    return resolvedMap;
  }

  // Retrieves account state and current balance.
  async getAccount(accountIdOrNumber: string): Promise<IAccountResponse> {
    const query = this.isUuid(accountIdOrNumber)
      ? 'SELECT * FROM accounts WHERE id = $1'
      : 'SELECT * FROM accounts WHERE number = $1';

    const rows = await this.dataSource.query(query, [accountIdOrNumber]);
    if (rows.length === 0) {
      throw new BadRequestException(`Account not found: ${accountIdOrNumber}`);
    }

    const account = rows[0];
    let groupBalance = null;

    if (account.bucket_group) {
      groupBalance = await this.bucketingService.getConsolidatedGroupBalance(account.bucket_group);
    }

    return {
      id: account.id,
      number: account.number,
      type: account.type,
      currency: account.currency,
      balance: account.balance.toString(),
      allowNegative: account.allow_negative,
      bucketGroup: account.bucket_group,
      consolidatedGroupBalance: groupBalance?.totalBalance.toString() ?? null,
      updatedAt: account.updated_at,
    };
  }

  // Retrieves account transaction statement.
  async getAccountStatement(
    accountIdOrNumber: string,
    limit = DEFAULT_STATEMENT_LIMIT
  ): Promise<IAccountStatementItem[]> {
    const accountId = await this.resolveAccountId(accountIdOrNumber);

    return this.dataSource.query(
      `SELECT 
         p.id AS posting_id,
         p.sequence_number,
         p.transaction_id,
         t.idempotency_key,
         t.type AS transaction_type,
         p.debit_account_id,
         da.number AS debit_account_number,
         p.credit_account_id,
         ca.number AS credit_account_number,
         p.amount::text,
         p.currency,
         p.created_at,
         CASE 
           WHEN p.credit_account_id = $1 THEN 'CREDIT'
           ELSE 'DEBIT'
         END AS direction
       FROM ledger_postings p
       JOIN ledger_transactions t ON t.id = p.transaction_id
       JOIN accounts da ON da.id = p.debit_account_id
       JOIN accounts ca ON ca.id = p.credit_account_id
       WHERE p.debit_account_id = $1 OR p.credit_account_id = $1
       ORDER BY p.created_at DESC, p.sequence_number DESC
       LIMIT $2`,
      [accountId, limit]
    );
  }
}
