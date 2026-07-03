import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PartnerFollowUp } from '../masters/partner/partner-followup.model';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  console.log('Syncing partner_followups table...');
  try {
    await PartnerFollowUp.sync({ alter: true });
    console.log('Successfully synced partner_followups table.');
  } catch (error) {
    console.error('Error syncing table:', error);
  }
  process.exit(0);
}

bootstrap();
