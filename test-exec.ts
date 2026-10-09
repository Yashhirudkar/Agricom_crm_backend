import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { SalesReportService } from './src/reports/sales/sales-report.service';

async function bootstrap() {
  console.log('Bootstrapping app to test SalesReportService...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const salesReportService = app.get(SalesReportService);
  
  console.log('Calling getExecutives...');
  const result = await salesReportService.getExecutives({});
  
  console.log('Done testing.');
  await app.close();
}

bootstrap().catch(err => {
  console.error(err);
  process.exit(1);
});
