import { Sequelize } from 'sequelize-typescript';
import * as dotenv from 'dotenv';

// Import all models explicitly
import { Client } from '../clients/models/client.model';
import { User } from '../users/models/user.model';
import { UserSession } from '../users/models/user-session.model';
import { Role } from '../rbac/models/role.model';
import { UserRole } from '../rbac/models/user-role.model';
import { Company } from '../companies/models/company.model';
import { UserCompany } from '../users/models/user-company.model';
import { UserInvitation } from '../users/models/user-invitation.model';
import { AuditLog } from '../audit/models/audit-log.model';
import { Department } from '../companies/models/department.model';
import { Designation } from '../hrms/models/designation.model';
import { Employee } from '../hrms/models/employee.model';
import { EmployeeDocument } from '../hrms/models/employee-document.model';
import { Branch } from '../hrms/models/branch.model';
import { EmployeeLifecycleLog } from '../hrms/models/employee-lifecycle-log.model';
import { CompanyHrPolicy } from '../companies/models/company-hr-policy.model';
import { LeaveType } from '../hrms/models/leave-type.model';
import { EmployeeLeaveBalance } from '../hrms/models/employee-leave-balance.model';
import { LeaveBalanceHistory } from '../hrms/models/leave-balance-history.model';
import { LeaveRequest } from '../hrms/models/leave-request.model';
import { LeaveApprovalStep } from '../hrms/models/leave-approval-step.model';
import { LeaveApprovalLog } from '../hrms/models/leave-approval-log.model';
import { UserPreference } from '../users/models/user-preference.model';
import { UserPasswordHistory } from '../users/models/user-password-history.model';
import { ProfileActivityLog } from '../profile/models/profile-activity-log.model';
import { Holiday } from '../holidays/models/holiday.model';
import { HolidayCompany } from '../holidays/models/holiday-company.model';
import { Shift } from '../attendance/models/shift.model';
import { AttendanceRecord } from '../attendance/models/attendance-record.model';
import { AttendanceLog } from '../attendance/models/attendance-log.model';
import { AttendanceException } from '../attendance/models/attendance-exception.model';

import { AppModule as AppModuleModel } from '../system/models/app-module.model';
import { ModuleResource } from '../system/models/module-resource.model';
import { ResourceAction } from '../system/models/resource-action.model';
import { SidebarFolder } from '../system/models/sidebar-folder.model';
import { SidebarItem } from '../system/models/sidebar-item.model';
import { SystemAuditLog } from '../system/models/system-audit-log.model';
import { RoleActionPermission } from '../rbac/models/role-action-permission.model';
import { ClientFolderAccess } from '../clients/models/client-folder-access.model';
import { ClientItemAccess } from '../clients/models/client-item-access.model';
import { ClientModuleAccess } from '../clients/models/client-module-access.model';
import { ClientActionAccess } from '../clients/models/client-action-access.model';

import { Category } from '../masters/category/category.model';
import {
  Task,
  TaskSequence,
  TaskStatus,
  TaskPriority,
  TaskAssignee,
  TaskActivity,
  TaskComment,
  TaskAttachment,
  TaskLabel,
  TaskLabelMap,
} from '../tasks/models';

dotenv.config();

export const sequelize = new Sequelize(
  process.env.DB_NAME || 'agricom',
  process.env.DB_USERNAME || 'postgres',
  process.env.DB_PASSWORD || 'postgres',
  {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    dialect: 'postgres',
    logging: false,
    models: [
      Client,
      Company,
      User,
      UserSession,
      Role,
      UserRole,
      UserCompany,
      UserInvitation,
      AuditLog,
      Department,
      Designation,
      Employee,
      EmployeeDocument,
      Branch,
      Holiday,
      HolidayCompany,
      EmployeeLifecycleLog,
      CompanyHrPolicy,
      LeaveType,
      EmployeeLeaveBalance,
      LeaveBalanceHistory,
      LeaveRequest,
      LeaveApprovalStep,
      LeaveApprovalLog,
      UserPreference,
      UserPasswordHistory,
      ProfileActivityLog,
      Shift,
      AttendanceRecord,
      AttendanceLog,
      AttendanceException,
      AppModuleModel,
      ModuleResource,
      ResourceAction,
      SidebarFolder,
      SidebarItem,
      SystemAuditLog,
      RoleActionPermission,
      ClientFolderAccess,
      ClientItemAccess,
      ClientModuleAccess,
      ClientActionAccess,
      Category,
      Task,
      TaskSequence,
      TaskStatus,
      TaskPriority,
      TaskAssignee,
      TaskActivity,
      TaskComment,
      TaskAttachment,
      TaskLabel,
      TaskLabelMap,
    ],
  },
);
