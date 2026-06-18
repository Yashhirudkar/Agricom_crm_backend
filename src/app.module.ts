import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ClientsModule } from './clients/modules/clients.module';
import { UsersModule } from './users/modules/users.module';
import { AuthModule } from './auth/modules/auth.module';
import { RbacModule } from './rbac/modules/rbac.module';
import { CompaniesModule } from './companies/modules/companies.module';
import { Client } from './clients/models/client.model';
import { User } from './users/models/user.model';
import { UserSession } from './users/models/user-session.model';
import { Role } from './rbac/models/role.model';

import { UserRole } from './rbac/models/user-role.model';
import { Company } from './companies/models/company.model';
import { UserCompany } from './users/models/user-company.model';
import { UserInvitation } from './users/models/user-invitation.model';
import { AuditLog } from './audit/models/audit-log.model';
import { Notification } from './notifications/models/notification.model';

import { Department } from './companies/models/department.model';
import { Designation } from './hrms/models/designation.model';
import { Employee } from './hrms/models/employee.model';
import { EmployeeDocument } from './hrms/models/employee-document.model';
import { Branch } from './hrms/models/branch.model';
import { EmployeeLifecycleLog } from './hrms/models/employee-lifecycle-log.model';
import { CompanyHrPolicy } from './companies/models/company-hr-policy.model';
import { LeaveType } from './hrms/models/leave-type.model';
import { EmployeeLeaveBalance } from './hrms/models/employee-leave-balance.model';
import { LeaveBalanceHistory } from './hrms/models/leave-balance-history.model';
import { LeaveRequest } from './hrms/models/leave-request.model';
import { LeaveApprovalStep } from './hrms/models/leave-approval-step.model';
import { LeaveApprovalLog } from './hrms/models/leave-approval-log.model';
import { NotificationsModule } from './notifications/modules/notifications.module';
import { AuditModule } from './audit/modules/audit.module';
import { HrmsModule } from './hrms/modules/hrms.module';
import { ProfileModule } from './profile/profile.module';
import { UserPreference } from './users/models/user-preference.model';
import { UserPasswordHistory } from './users/models/user-password-history.model';
import { ProfileActivityLog } from './profile/models/profile-activity-log.model';
import { HolidaysModule } from './holidays/holidays.module';
import { Holiday } from './holidays/models/holiday.model';
import { HolidayCompany } from './holidays/models/holiday-company.model';
import { AttendanceModule } from './attendance/attendance.module';
import { Shift } from './attendance/models/shift.model';
import { AttendanceRecord } from './attendance/models/attendance-record.model';
import { AttendanceLog } from './attendance/models/attendance-log.model';
import { AttendanceException } from './attendance/models/attendance-exception.model';

import { join } from 'path';

import { AttachmentsModule } from './attachments/modules/attachments.module';
import { SystemModule } from './system/modules/system.module';

import { AuditMiddleware } from './audit/middlewares/audit.middleware';

// New dynamic RBAC and Sidebar models
import { AppModule as AppModuleModel } from './system/models/app-module.model';
import { ModuleResource } from './system/models/module-resource.model';
import { ResourceAction } from './system/models/resource-action.model';
import { SidebarFolder } from './system/models/sidebar-folder.model';
import { SidebarItem } from './system/models/sidebar-item.model';
import { SystemAuditLog } from './system/models/system-audit-log.model';
import { RoleActionPermission } from './rbac/models/role-action-permission.model';
import { ClientFolderAccess } from './clients/models/client-folder-access.model';
import { ClientItemAccess } from './clients/models/client-item-access.model';
import { ClientModuleAccess } from './clients/models/client-module-access.model';
import { ClientActionAccess } from './clients/models/client-action-access.model';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const env = configService.get<string>('NODE_ENV') || 'development';
        const isDevelopment = env === 'development' || env === 'test';
        const shouldSync = isDevelopment && configService.get<string>('DB_SYNC') === 'true';

        return {
          dialect: 'postgres',
          host: configService.get<string>('DB_HOST'),
          port: configService.get<number>('DB_PORT'),
          username: configService.get<string>('DB_USERNAME'),
          password: configService.get<string>('DB_PASSWORD'),
          database: configService.get<string>('DB_NAME'),
          models: [Client, Company, User, UserSession, Role, UserRole, UserCompany, UserInvitation, AuditLog, Notification, Department, Designation, Employee, EmployeeDocument, Branch, Holiday, HolidayCompany, EmployeeLifecycleLog, CompanyHrPolicy, LeaveType, EmployeeLeaveBalance, LeaveBalanceHistory, LeaveRequest, LeaveApprovalStep, LeaveApprovalLog, UserPreference, UserPasswordHistory, ProfileActivityLog, Shift, AttendanceRecord, AttendanceLog, AttendanceException, AppModuleModel, ModuleResource, ResourceAction, SidebarFolder, SidebarItem, SystemAuditLog, RoleActionPermission, ClientFolderAccess, ClientItemAccess, ClientModuleAccess, ClientActionAccess],
          autoLoadModels: true,
          synchronize: shouldSync,
          sync: shouldSync ? { alter: true } : undefined,
          logging: false,
          retryAttempts: 0,
        };
      },
    }),
    ClientsModule,
    UsersModule,
    AuthModule,
    RbacModule,
    CompaniesModule,
    NotificationsModule,
    AuditModule,
    HrmsModule,
    AttachmentsModule,
    SystemModule,
    HolidaysModule,
    ProfileModule,
    AttendanceModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuditMiddleware).forRoutes('*path');
  }
}



