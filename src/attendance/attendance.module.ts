import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
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
import { RolePermission } from '../rbac/models/role-permission.model';
import { Company } from '../companies/models/company.model';
import { LeaveRequest } from '../hrms/models/leave-request.model';
import { EmployeeLeaveBalance } from '../hrms/models/employee-leave-balance.model';
import { LeaveType } from '../hrms/models/leave-type.model';

import { AttendanceController } from './controllers/attendance.controller';
import { ShiftsController } from './controllers/shifts.controller';
import { AttendanceService } from './services/attendance.service';
import { ShiftsService } from './services/shifts.service';
import { AttendanceCronService } from './services/attendance-cron.service';
import { AttendanceBreakCronService } from './services/attendance-break-cron.service';

import { RbacModule } from '../rbac/modules/rbac.module';
import { AuditModule } from '../audit/modules/audit.module';

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
      RolePermission,
      Company,
      LeaveRequest,
      EmployeeLeaveBalance,
      LeaveType,
    ]),
    RbacModule,
    AuditModule,
  ],
  controllers: [AttendanceController, ShiftsController],
  providers: [AttendanceService, ShiftsService, AttendanceCronService, AttendanceBreakCronService],
  exports: [AttendanceService, ShiftsService, AttendanceCronService, AttendanceBreakCronService],
})
export class AttendanceModule {}
