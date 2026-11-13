import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { join } from 'path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import compression from 'compression';
import * as express from 'express';
import { performance } from 'node:perf_hooks';
import { measureStartupStep } from './common/startup-timing';

async function bootstrap() {
  const startupLogger = new Logger('Startup');
  const startupStartedAt = performance.now();
  try {
    const app = await measureStartupStep('NestFactory.create()', () =>
      NestFactory.create<NestExpressApplication>(AppModule, {
        logger: ['log', 'error', 'warn'],
      }),
    );

    app.use(compression());
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));
    app.useStaticAssets(join(process.cwd(), 'uploads'), {
      prefix: '/api/uploads/',
    });
    app.useStaticAssets(join(process.cwd(), 'uploads'), {
      prefix: '/uploads/',
    });

    app.setGlobalPrefix('api');

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
      }),
    );

    const configService = app.get(ConfigService);
    const port = configService.get<number>('PORT') || 5000;

    app.enableCors({
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-company-id',
        'Idempotency-Key',
        'idempotency-key',
      ],
      credentials: true,
    });

    await measureStartupStep('Module initialization (DB + lifecycle hooks)', () =>
      app.init(),
    );
    await measureStartupStep('HTTP listen', () =>
      app.listen(port, '0.0.0.0'),
    );

    console.log(`Application is running on: http://0.0.0.0:${port}/api`);
  } finally {
    startupLogger.log(
      `TOTAL STARTUP .......... ${(performance.now() - startupStartedAt).toFixed(1)}ms`,
    );
  }
}
bootstrap();
