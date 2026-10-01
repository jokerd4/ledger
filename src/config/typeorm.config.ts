import { TypeOrmModuleAsyncOptions, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import { AccountEntity } from '../entities/account.entity';
import { LedgerTransactionEntity } from '../entities/ledger-transaction.entity';
import { LedgerPostingEntity } from '../entities/ledger-posting.entity';
import type { AppConfig } from './app.config';
import type { DatabaseConfig } from './database.config';

dotenv.config();

export const buildTypeOrmOptions = (
  db: DatabaseConfig,
  app: AppConfig,
): DataSourceOptions => ({
  type: 'postgres',
  host: db.host,
  port: db.port,
  username: db.username,
  password: db.password,
  database: db.database,
  entities: [AccountEntity, LedgerTransactionEntity, LedgerPostingEntity],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: app.nodeEnv !== 'production',
  logging: app.nodeEnv === 'development' ? ['error', 'warn'] : ['error'],
  extra: {
    max: 100,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },
});

export const typeOrmConfig: DataSourceOptions = buildTypeOrmOptions(
  {
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT)!,
    username: process.env.DB_USERNAME!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_DATABASE!,
  },
  {
    port: Number(process.env.PORT)!,
    nodeEnv: process.env.NODE_ENV!,
  },
);

export const typeOrmAsyncConfig: TypeOrmModuleAsyncOptions = {
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService): TypeOrmModuleOptions =>
    buildTypeOrmOptions(
      configService.get<DatabaseConfig>('database')!,
      configService.get<AppConfig>('app')!,
    ),
};

export default new DataSource(typeOrmConfig);
