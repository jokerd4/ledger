import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const logger = new Logger('WorkerBootstrap');
  logger.log('Bootstrapping standalone Ledger Batch Worker...');

  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();

  logger.log('Standalone Ledger Batch Worker is active and running.');

  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}. Gracefully stopping worker context...`);
    await app.close();
    logger.log('Worker context stopped successfully.');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('Fatal worker bootstrap error:', err);
  process.exit(1);
});
