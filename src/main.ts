import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PartnerFollowUp } from './masters/partner/partner-followup.model';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn'],
  });

  // Serve static assets (like uploaded profile images)
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/api/uploads/',
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
  // NOTE: origin: true reflects the request origin dynamically (valid with credentials: true)
  // origin: '*' is INVALID with credentials: true — browsers will reject it
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

  // console.log('Force syncing partner_followups table...');
  //await PartnerFollowUp.sync({ alter: true });
  // console.log('Table synced!');


  // await app.listen(port);
  // console.log(`Application is running on: ${await app.getUrl()}/api`);
  await app.listen(port);

  console.log(`Application is running on: http://localhost:${port}/api`);

}
bootstrap();
// Trigger DB sync for Sales Contracts
// Trigger restart for SEED_DB
// Trigger restart for admin fallback fix
// Trigger DB sync for Enquiries
// Revert DB sync to false
