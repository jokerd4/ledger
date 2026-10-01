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
import { LedgerModule } from './ledger.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, ledgerConfig],
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync(typeOrmAsyncConfig),
    LedgerModule,
  ],
})
export class AppModule {}
