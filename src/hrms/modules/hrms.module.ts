import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Department } from '../../companies/models/department.model';
import { Designation } from '../models/designation.model';
import { Employee } from '../models/employee.model';
import { EmployeeDocument } from '../models/employee-document.model';
import { Branch } from '../models/branch.model';
import { EmployeeLifecycleLog } from '../models/employee-lifecycle-log.model';
import { Holiday } from '../../holidays/models/holiday.model';
import { HolidayCompany } from '../../holidays/models/holiday-company.model';
import { LeaveType } from '../models/leave-type.model';
import { EmployeeLeaveBalance } from '../models/employee-leave-balance.model';
import { LeaveBalanceHistory } from '../models/leave-balance-history.model';
import { LeaveRequest } from '../models/leave-request.model';
import { LeaveApprovalStep } from '../models/leave-approval-step.model';
import { LeaveApprovalLog } from '../models/leave-approval-log.model';
import { CompanyHrPolicy } from '../../companies/models/company-hr-policy.model';
import { AuditModule } from '../../audit/modules/audit.module';
import { RbacModule } from '../../rbac/modules/rbac.module';
import { UsersModule } from '../../users/modules/users.module';

import { DepartmentsService } from '../services/departments.service';
import { DepartmentsController } from '../controllers/departments.controller';

import { DesignationsService } from '../services/designations.service';
import { DesignationsController } from '../controllers/designations.controller';

import { EmployeesService } from '../services/employees.service';
import { EmployeesController } from '../controllers/employees.controller';
import { StorageService } from '../services/storage.service';

import { BranchesService } from '../services/branches.service';
import { BranchesController } from '../controllers/branches.controller';

// HolidaysService and HolidaysController removed to avoid conflict with standalone holidays module

import { LeaveTypesService } from '../services/leave-types.service';
import { LeaveTypesController } from '../controllers/leave-types.controller';

import { LeaveBalancesService } from '../services/leave-balances.service';
import { LeaveBalancesController } from '../controllers/leave-balances.controller';

import { LeaveRequestsService } from '../services/leave-requests.service';
import { LeaveRequestsController } from '../controllers/leave-requests.controller';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Department, Designation, Employee, EmployeeDocument, Branch, 
      EmployeeLifecycleLog, Holiday, HolidayCompany, LeaveType, EmployeeLeaveBalance, 
      LeaveBalanceHistory, LeaveRequest, LeaveApprovalStep, LeaveApprovalLog, CompanyHrPolicy
    ]),
    AuditModule,
    RbacModule,
    UsersModule,
  ],
  providers: [
    DepartmentsService, DesignationsService, EmployeesService, StorageService, 
    BranchesService, LeaveTypesService, LeaveBalancesService, LeaveRequestsService
  ],
  controllers: [
    DepartmentsController, DesignationsController, EmployeesController, 
    BranchesController, LeaveTypesController, LeaveBalancesController, LeaveRequestsController
  ],
  exports: [
    DepartmentsService, DesignationsService, EmployeesService, StorageService, 
    BranchesService, LeaveTypesService, LeaveBalancesService, LeaveRequestsService
  ],
})
export class HrmsModule {}
