import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  Index,
  Check,
} from 'typeorm';
import { AccountType } from '../enums/account-type.enum';
import { BigIntTransformer } from './transformers/bigint.transformer';

@Entity('accounts')
@Check('chk_account_balance', '"balance" >= 0 OR "allow_negative" = true')
@Index('idx_accounts_bucket_group', ['bucketGroup'])
@Index('idx_accounts_type_currency', ['type', 'currency'])
export class AccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  number: string;

  @Column({ type: 'varchar', length: 32 })
  type: AccountType | string;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({
    type: 'bigint',
    default: '0',
    transformer: new BigIntTransformer(),
  })
  balance: bigint;

  @Column({ type: 'boolean', default: false, name: 'allow_negative' })
  allowNegative: boolean;

  @Column({ type: 'varchar', length: 32, nullable: true, name: 'bucket_group' })
  bucketGroup: string | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
