import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { Shift } from './models/shift.model';
import { AttendanceRecord } from './models/attendance-record.model';
import { AttendanceLog } from './models/attendance-log.model';
import { AttendanceException } from './models/attendance-exception.model';
import { CompanyBreakPolicy } from './models/company-break-policy.model';
import { Employee } from '../hrms/models/employee.model';
import { CompanyHrPolicy } from '../companies/models/company-hr-policy.model';
import { Holiday } from '../holidays/models/holiday.model';
import { HolidayCompany } from '../holidays/models/holiday-company.model';
import { UserCompany } from '../users/models/user-company.model';
import { UserRole } from '../rbac/models/user-role.model';

import { Company } from '../companies/models/company.model';
import { LeaveRequest } from '../hrms/models/leave-request.model';
import { EmployeeLeaveBalance } from '../hrms/models/employee-leave-balance.model';
import { LeaveType } from '../hrms/models/leave-type.model';

import { AttendanceController } from './controllers/attendance.controller';
import { ShiftsController } from './controllers/shifts.controller';
import { AttendanceService } from './services/attendance.service';
import { AttendanceHelperService } from './services/attendance-helper.service';
import { AttendanceReportService } from './services/attendance-report.service';
import { AttendanceAdminService } from './services/attendance-admin.service';
import { AttendanceRegularizationService } from './services/attendance-regularization.service';
import { AttendanceExceptionsQueryService } from './services/attendance-exceptions-query.service';
import { ShiftsService } from './services/shifts.service';
import { AttendanceCronService } from './services/attendance-cron.service';
import { AttendanceBreakCronService } from './services/attendance-break-cron.service';
import { AttendanceGateway } from './gateways/attendance.gateway';

import { RbacModule } from '../rbac/modules/rbac.module';
import { AuditModule } from '../audit/modules/audit.module';
import { SystemModule } from '../system/modules/system.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Shift,
      AttendanceRecord,
      AttendanceLog,
      AttendanceException,
      CompanyBreakPolicy,
      Employee,
      CompanyHrPolicy,
      Holiday,
      HolidayCompany,
      UserCompany,
      UserRole,
      Company,
      LeaveRequest,
      EmployeeLeaveBalance,
      LeaveType,
    ]),
    RbacModule,
    AuditModule,
    SystemModule,
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
  controllers: [AttendanceController, ShiftsController],
  providers: [
    AttendanceService,
    AttendanceHelperService,
    AttendanceReportService,
    AttendanceAdminService,
    AttendanceRegularizationService,
    AttendanceExceptionsQueryService,
    ShiftsService,
    AttendanceCronService,
    AttendanceBreakCronService,
    AttendanceGateway,
  ],
  exports: [
    AttendanceService,
    AttendanceHelperService,
    AttendanceReportService,
    AttendanceAdminService,
    AttendanceRegularizationService,
    AttendanceExceptionsQueryService,
    ShiftsService,
    AttendanceCronService,
    AttendanceBreakCronService,
    AttendanceGateway,
  ],
})
export class AttendanceModule {}
