import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { AttendanceService } from './src/attendance/services/attendance.service';

async function bootstrap() {
  console.log('Bootstrapping NestJS for testing getMonthlyReport...');
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const attendanceService = app.get(AttendanceService);
  
  console.log('Calling getMonthlyReport for Company 1, employee 2, month 6, year 2026:');
  const report = await attendanceService.getMonthlyReport(1, { month: 6, year: 2026, employeeId: 2 });
  
  console.log('Report result size:', report.length);
  
  await app.close();
  process.exit(0);
}

bootstrap().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
