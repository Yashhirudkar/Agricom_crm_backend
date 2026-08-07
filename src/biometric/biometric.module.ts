import { Module, forwardRef } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { BiometricDevice } from './models/biometric-device.model';
import { BiometricPunchLog } from './models/biometric-punch-log.model';
import { BiometricController } from './controllers/biometric.controller';
import { BiometricService } from './services/biometric.service';
import { BiometricQueueService } from './services/biometric-queue.service';
import { BiometricDeviceService } from './services/biometric-device.service';
import { BiometricMappingService } from './services/biometric-mapping.service';
import { BiometricMetricsService } from './services/biometric-metrics.service';
import { BiometricLogService } from './services/biometric-log.service';
import { BiometricRetryService } from './services/biometric-retry.service';
import { BiometricHealthPollerService } from './services/biometric-health-poller.service';
import { BiometricSyncService } from './services/biometric-sync.service';

import { AttendanceModule } from '../attendance/attendance.module';
import { RbacModule } from '../rbac/modules/rbac.module';
import { AuditModule } from '../audit/modules/audit.module';

import { AttendanceRecord } from '../attendance/models/attendance-record.model';
import { AttendanceLog } from '../attendance/models/attendance-log.model';
import { AttendanceAuditTrail } from '../attendance/models/attendance-audit-trail.model';
import { Employee } from '../hrms/models/employee.model';
import { CompanyHrPolicy } from '../companies/models/company-hr-policy.model';
import { Shift } from '../attendance/models/shift.model';

@Module({
  imports: [
    SequelizeModule.forFeature([
      BiometricDevice,
      BiometricPunchLog,
      AttendanceRecord,
      AttendanceLog,
      AttendanceAuditTrail,
      Employee,
      CompanyHrPolicy,
      Shift,
    ]),
    forwardRef(() => AttendanceModule), // Avoids circular dependency issues
    RbacModule,
    AuditModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (configService.get<string>('JWT_ACCESS_EXPIRES') ||
            '15m') as any,
        },
      }),
    }),
  ],
  controllers: [BiometricController],
  providers: [
    BiometricService,
    BiometricQueueService,
    BiometricDeviceService,
    BiometricMappingService,
    BiometricMetricsService,
    BiometricLogService,
    BiometricRetryService,
    BiometricHealthPollerService,
    BiometricSyncService,
  ],
  exports: [
    BiometricService,
    BiometricQueueService,
    BiometricDeviceService,
    BiometricMappingService,
    BiometricMetricsService,
    BiometricLogService,
    BiometricRetryService,
    BiometricHealthPollerService,
    BiometricSyncService,
    SequelizeModule,
  ],
})
export class BiometricModule {}
