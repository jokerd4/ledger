import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { AccountService } from './account.service';
import { IExecutePaymentCommand } from '../interfaces/execute-payment-command.interface';
import { IPaymentExecutionResult } from '../interfaces/payment-execution-result.interface';
import { IPostingInstruction } from '../interfaces/posting-instruction.interface';

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly accountService: AccountService,
  ) {}

  // Executes a batch of double-entry postings with ACID guarantees, overdraft control, currency consistency, and deadlock prevention.
  async executeTransaction(command: IExecutePaymentCommand): Promise<IPaymentExecutionResult> {
    if (!command.postings || command.postings.length === 0) {
      throw new BadRequestException('Transaction must contain at least one posting');
    }

    // 1. Fast idempotency check before acquiring database locks
    const existing = await this.dataSource.query(
      'SELECT id, status FROM ledger_transactions WHERE idempotency_key = $1',
      [command.idempotencyKey]
    );

    if (existing.length > 0) {
      this.logger.log(`Idempotent hit: transaction for key "${command.idempotencyKey}" already exists`);
      return {
        transactionId: existing[0].id,
        status: existing[0].status,
        idempotencyKey: command.idempotencyKey,
        isCached: true,
        postingsCount: command.postings.length,
        affectedAccountsCount: 0,
      };
    }

    // 2. Resolve any account numbers to UUIDs via AccountService
    const allAccountIds: string[] = [];
    for (const p of command.postings) {
      allAccountIds.push(p.debitAccountId, p.creditAccountId);
    }
    const resolvedMap = await this.accountService.resolveAccountIds(allAccountIds);

    const normalizedPostings: IPostingInstruction[] = command.postings.map((p) => ({
      ...p,
      debitAccountId: resolvedMap.get(p.debitAccountId) ?? p.debitAccountId,
      creditAccountId: resolvedMap.get(p.creditAccountId) ?? p.creditAccountId,
    }));

    // 3. Validate amounts and aggregate net deltas per account in memory
    const deltas = new Map<string, bigint>();

    for (const p of normalizedPostings) {
      const amount = BigInt(p.amount);
      if (amount <= 0n) {
        throw new BadRequestException(`Posting amount must be strictly positive, got: ${p.amount}`);
      }
      if (p.debitAccountId === p.creditAccountId) {
        throw new BadRequestException(`Debit and credit accounts must be different in posting #${p.sequenceNumber}`);
      }

      deltas.set(p.debitAccountId, (deltas.get(p.debitAccountId) ?? 0n) - amount);
      deltas.set(p.creditAccountId, (deltas.get(p.creditAccountId) ?? 0n) + amount);
    }

    // Invariant check: sum of all deltas must equal zero (closed double-entry system)
    let deltaSum = 0n;
    for (const delta of deltas.values()) {
      deltaSum += delta;
    }
    if (deltaSum !== 0n) {
      throw new BadRequestException(`Double-entry invariant violated: sum of deltas is ${deltaSum}, expected 0`);
    }

    // 4. Atomic insertion of transaction in PROCESSING status and its postings
    const queryRunner: QueryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const txRows = await queryRunner.query(
        `INSERT INTO ledger_transactions (idempotency_key, type, status, description)
         VALUES ($1, $2, 'PROCESSING', $3)
         RETURNING id, status`,
        [command.idempotencyKey, command.transactionType, command.description ?? null]
      );
      const transactionId = txRows[0].id;

      const seqs = normalizedPostings.map((p) => p.sequenceNumber);
      const debits = normalizedPostings.map((p) => p.debitAccountId);
      const credits = normalizedPostings.map((p) => p.creditAccountId);
      const amounts = normalizedPostings.map((p) => p.amount.toString());
      const currencies = normalizedPostings.map((p) => p.currency);

      await queryRunner.query(
        `INSERT INTO ledger_postings (transaction_id, sequence_number, debit_account_id, credit_account_id, amount, currency)
         SELECT $1, * FROM UNNEST($2::int[], $3::uuid[], $4::uuid[], $5::bigint[], $6::varchar[])`,
        [transactionId, seqs, debits, credits, amounts, currencies]
      );

      await queryRunner.commitTransaction();

      return {
        transactionId,
        status: 'PROCESSING',
        idempotencyKey: command.idempotencyKey,
        isCached: false,
        postingsCount: normalizedPostings.length,
        affectedAccountsCount: deltas.size,
      };
    } catch (error: any) {
      await queryRunner.rollbackTransaction();

      // Handle race condition for concurrent requests with identical idempotency_key
      if (error.code === '23505' && error.constraint === 'uq_tx_idempotency') {
        const existingAfterRace = await this.dataSource.query(
          'SELECT id, status FROM ledger_transactions WHERE idempotency_key = $1',
          [command.idempotencyKey]
        );
        if (existingAfterRace.length > 0) {
          return {
            transactionId: existingAfterRace[0].id,
            status: existingAfterRace[0].status,
            idempotencyKey: command.idempotencyKey,
            isCached: true,
            postingsCount: command.postings.length,
            affectedAccountsCount: 0,
          };
        }
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // Retrieves full transaction details including all postings
  async getTransactionDetails(identifier: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
    const txQuery = isUuid
      ? 'SELECT * FROM ledger_transactions WHERE id = $1'
      : 'SELECT * FROM ledger_transactions WHERE idempotency_key = $1';

    const txRows = await this.dataSource.query(txQuery, [identifier]);
    if (txRows.length === 0) {
      throw new BadRequestException(`Transaction not found: ${identifier}`);
    }

    const tx = txRows[0];

    const postings = await this.dataSource.query(
      `SELECT 
         p.id AS posting_id,
         p.sequence_number,
         p.debit_account_id,
         da.number AS debit_account_number,
         p.credit_account_id,
         ca.number AS credit_account_number,
         p.amount,
         p.currency,
         p.created_at
       FROM ledger_postings p
       JOIN accounts da ON da.id = p.debit_account_id
       JOIN accounts ca ON ca.id = p.credit_account_id
       WHERE p.transaction_id = $1
       ORDER BY p.sequence_number ASC`,
      [tx.id]
    );

    return {
      id: tx.id,
      idempotencyKey: tx.idempotency_key,
      type: tx.type,
      status: tx.status,
      description: tx.description,
      createdAt: tx.created_at,
      postings: postings.map((p: any) => ({
        id: p.posting_id,
        sequenceNumber: p.sequence_number,
        debitAccountId: p.debit_account_id,
        debitAccountNumber: p.debit_account_number,
        creditAccountId: p.credit_account_id,
        creditAccountNumber: p.credit_account_number,
        amount: p.amount.toString(),
        currency: p.currency,
        createdAt: p.created_at,
      })),
    };
  }
}
