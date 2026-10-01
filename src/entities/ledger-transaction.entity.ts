import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { TransactionType } from '../enums/transaction-type.enum';
import { TransactionStatus } from '../enums/transaction-status.enum';

@Entity('ledger_transactions')
@Index('uq_tx_idempotency', ['idempotencyKey'], { unique: true })
@Index('idx_tx_created_at', ['createdAt'])
export class LedgerTransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, name: 'idempotency_key' })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 32 })
  type: TransactionType | string;

  @Column({ type: 'varchar', length: 32, default: TransactionStatus.POSTED })
  status: TransactionStatus | string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
