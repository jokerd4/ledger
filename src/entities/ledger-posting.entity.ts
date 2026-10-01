import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Check,
} from 'typeorm';
import { BigIntTransformer } from './transformers/bigint.transformer';
import { LedgerTransactionEntity } from './ledger-transaction.entity';
import { AccountEntity } from './account.entity';

@Entity('ledger_postings')
@Check('chk_different_accounts', '"debit_account_id" != "credit_account_id"')
@Check('chk_posting_amount_positive', '"amount" > 0')
@Index('idx_postings_tx_id', ['transactionId'])
@Index('idx_postings_debit_acc', ['debitAccountId'])
@Index('idx_postings_credit_acc', ['creditAccountId'])
@Index('idx_postings_created_at', ['createdAt'])
export class LedgerPostingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'transaction_id' })
  transactionId: string;

  @Column({ type: 'int', name: 'sequence_number' })
  sequenceNumber: number;

  @Column({ type: 'uuid', name: 'debit_account_id' })
  debitAccountId: string;

  @Column({ type: 'uuid', name: 'credit_account_id' })
  creditAccountId: string;

  @Column({
    type: 'bigint',
    transformer: new BigIntTransformer(),
  })
  amount: bigint;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => LedgerTransactionEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'transaction_id' })
  transaction?: LedgerTransactionEntity;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'debit_account_id' })
  debitAccount?: AccountEntity;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'credit_account_id' })
  creditAccount?: AccountEntity;
}
