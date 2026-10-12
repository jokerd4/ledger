import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  appConfig,
  databaseConfig,
  ledgerConfig,
  validateEnv,
  typeOrmAsyncConfig,
} from './config';
import { LedgerBatchWorker } from './services/ledger-batch.worker';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, ledgerConfig],
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync(typeOrmAsyncConfig),
  ],
  providers: [LedgerBatchWorker],
  exports: [LedgerBatchWorker],
})
export class WorkerModule {}
