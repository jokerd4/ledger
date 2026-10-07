import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from './entities/account.entity';
import { LedgerTransactionEntity } from './entities/ledger-transaction.entity';
import { LedgerPostingEntity } from './entities/ledger-posting.entity';
import {
  LedgerService,
  PaymentService,
  AccountService,
  ReconciliationService,
} from './services';
import { LedgerController } from './controllers/ledger.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountEntity,
      LedgerTransactionEntity,
      LedgerPostingEntity,
    ]),
  ],
  controllers: [LedgerController],
  providers: [
    LedgerService,
    PaymentService,
    AccountService,
    ReconciliationService,
  ],
  exports: [
    LedgerService,
    PaymentService,
    AccountService,
    ReconciliationService,
  ],
})
export class LedgerModule {}
