import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { Shift } from './models/shift.model';
import { AttendanceRecord } from './models/attendance-record.model';
import { AttendanceLog } from './models/attendance-log.model';
import { AttendanceException } from './models/attendance-exception.model';
import { AttendanceAuditTrail } from './models/attendance-audit-trail.model';
import { CompanyBreakPolicy } from './models/company-break-policy.model';
import { SentReminder } from './models/sent-reminder.model';
import { Employee } from '../hrms/models/employee.model';
import { CompanyHrPolicy } from '../companies/models/company-hr-policy.model';
import { Holiday } from '../holidays/models/holiday.model';
import { HolidayCompany } from '../holidays/models/holiday-company.model';
import { UserCompany } from '../users/models/user-company.model';
import { UserRole } from '../rbac/models/user-role.model';
import { User } from '../users/models/user.model';

import { Company } from '../companies/models/company.model';
import { LeaveRequest } from '../hrms/models/leave-request.model';
import { EmployeeLeaveBalance } from '../hrms/models/employee-leave-balance.model';
import { LeaveType } from '../hrms/models/leave-type.model';
import { LeaveBalanceHistory } from '../hrms/models/leave-balance-history.model';

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
import { AttendanceReminderService } from './services/attendance-reminder.service';
import { AttendanceGateway } from './gateways/attendance.gateway';

import { RbacModule } from '../rbac/modules/rbac.module';
import { AuditModule } from '../audit/modules/audit.module';
import { SystemModule } from '../system/modules/system.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttendanceConflictService } from './services/attendance-conflict.service';
import { AuditLog } from '../audit/models/audit-log.model';

import { AttendancePolicyEngineService } from './services/attendance-policy-engine.service';
import { AttendanceSummaryService } from './services/attendance-summary.service';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Shift,
      AttendanceRecord,
      AttendanceLog,
      AttendanceException,
      AttendanceAuditTrail,
      CompanyBreakPolicy,
      SentReminder,
      Employee,
      CompanyHrPolicy,
      Holiday,
      HolidayCompany,
      UserCompany,
      UserRole,
      User,
      Company,
      LeaveRequest,
      EmployeeLeaveBalance,
      LeaveBalanceHistory,
      LeaveType,
      AuditLog,
    ]),
    RbacModule,
    AuditModule,
    SystemModule,
    NotificationsModule,
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
    AttendancePolicyEngineService,
    AttendanceSummaryService,
    AttendanceService,
    AttendanceHelperService,
    AttendanceReportService,
    AttendanceAdminService,
    AttendanceRegularizationService,
    AttendanceExceptionsQueryService,
    ShiftsService,
    AttendanceCronService,
    AttendanceBreakCronService,
    AttendanceReminderService,
    AttendanceGateway,
    AttendanceConflictService,
  ],
  exports: [
    AttendancePolicyEngineService,
    AttendanceSummaryService,
    AttendanceService,
    AttendanceHelperService,
    AttendanceReportService,
    AttendanceAdminService,
    AttendanceRegularizationService,
    AttendanceExceptionsQueryService,
    ShiftsService,
    AttendanceCronService,
    AttendanceBreakCronService,
    AttendanceReminderService,
    AttendanceGateway,
    AttendanceConflictService,
  ],
})
export class AttendanceModule {}

