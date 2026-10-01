import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  @IsNotEmpty()
  NODE_ENV: Environment;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(65535)
  @IsNotEmpty()
  PORT: number;

  @IsString()
  @IsNotEmpty()
  DB_HOST: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(65535)
  @IsNotEmpty()
  DB_PORT: number;

  @IsString()
  @IsNotEmpty()
  DB_USERNAME: string;

  @IsString()
  @IsNotEmpty()
  DB_PASSWORD: string;

  @IsString()
  @IsNotEmpty()
  DB_DATABASE: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(256)
  @IsNotEmpty()
  REVENUE_BUCKETS_COUNT: number;

  @IsString()
  @IsNotEmpty()
  DEFAULT_CURRENCY: string;

  @Type(() => Number)
  @IsNumber()
  @Min(100)
  @Max(60000)
  @IsNotEmpty()
  LOCK_TIMEOUT_MS: number;
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((err) => Object.values(err.constraints || {}).join(', '))
      .join('; ');
    throw new Error(`Environment validation failed. Missing or invalid variables: ${messages}`);
  }

  return validatedConfig;
}
