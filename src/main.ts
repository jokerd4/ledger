import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import type { AppConfig } from './config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    })
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Payment Core Ledger API')
    .setDescription(
      'High-throughput double-entry financial ledger engine with strict ACID guarantees, ' +
      'zero-deadlock resource ordering, and overdraft protection.'
    )
    .setVersion('1.0.0')
    .addTag('Ledger')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const configService = app.get(ConfigService);
  const appCfg = configService.get<AppConfig>('app')!;
  await app.listen(appCfg.port);

  logger.log(`Payment Core Ledger Service is running on port ${appCfg.port} [${appCfg.nodeEnv}]`);
  logger.log(`Swagger Documentation: http://localhost:${appCfg.port}/api/docs`);
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
