import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn'],
  });

  // Serve static assets (like uploaded profile images)
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  // Set global API prefix
  app.setGlobalPrefix('api');

  // Enable validation globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Set up Swagger API Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Agricom CRM API')
    .setDescription('The API documentation for Agricom SaaS CRM')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  // const document = SwaggerModule.createDocument(app, swaggerConfig);
  // SwaggerModule.setup('api/docs', app, document);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 5000;

  // Enable CORS for frontend
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:3001'],
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

  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}/api`);
  // console.log(`Swagger UI is available at: http://localhost:${port}/api/docs`);
}
bootstrap();
// Trigger restart for SEED_DB
// Trigger restart for admin fallback fix
