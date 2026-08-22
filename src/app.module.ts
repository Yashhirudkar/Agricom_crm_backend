import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SalesContractsModule } from './sales-contracts/sales-contracts.module';
import { SequelizeModule } from '@nestjs/sequelize';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
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
import { MastersModule } from './masters/masters.module';
import { Category } from './masters/category/category.model';
import { PartnerRole } from './masters/partner-role/partner-role.model';
import { Product } from './masters/product/product.model';
import { Partner } from './masters/partner/partner.model';
import { PartnerContact } from './masters/partner/partner-contact.model';
import { PartnerProduct } from './masters/partner/partner-product.model';
import { PartnerFollowUp } from './masters/partner/partner-followup.model';
import { PartnerDnbReport } from './masters/partner/partner-dnb-report.model';
import { PartnerRoleDynamicConfig } from './masters/partner-role/partner-role-dynamic-config.model';
import { PartnerDynamicConfigHistory } from './masters/partner-role/partner-dynamic-config-history.model';
import { PartnerDynamicValues } from './masters/partner/partner-dynamic-values.model';
import { BagType } from './masters/bag-specs/models/bag-type.model';
import { PackingType } from './masters/bag-specs/models/packing-type.model';
import { BagSpecification } from './masters/bag-specs/models/bag-specification.model';
import { ProductBagAssignment } from './masters/bag-specs/models/product-bag-assignment.model';
import { Currency } from './masters/currency/currency.model';

import { ShipmentType } from './masters/shipment-type/shipment-type.model';
import { PaymentTerm } from './masters/payment-term/payment-term.model';
import { TradeDocument } from './masters/trade-document/trade-document.model';
import { SalesContract } from './sales-contracts/models/sales-contract.model';
import { SalesContractItem } from './sales-contracts/models/sales-contract-item.model';
import { SalesContractShipment } from './sales-contracts/models/sales-contract-shipment.model';
import { SalesContractDocument } from './sales-contracts/models/sales-contract-document.model';
import { SalesContractDocumentFile } from './sales-contracts/models/sales-contract-document-file.model';
import { Attachment } from './attachments/models/attachment.model';
import { PurchaseContract } from './purchase-contracts/models/purchase-contract.model';
import { PurchaseContractShipment } from './purchase-contracts/models/purchase-contract-shipment.model';
import { PurchaseContractRequiredDocument } from './purchase-contracts/models/purchase-contract-required-document.model';
import { PurchaseContractActivity } from './purchase-contracts/models/purchase-contract-activity.model';
import { PurchaseContractAttachment } from './purchase-contracts/models/purchase-contract-attachment.model';
import { PurchaseContractsModule } from './purchase-contracts/purchase-contracts.module';
import { Enquiry } from './enquiries/models/enquiry.model';

import { TasksModule } from './tasks/tasks.module';
import { EnquiriesModule } from './enquiries/enquiries.module';
import { LocationsModule } from './locations/locations.module';
import { NotificationsModule } from './notifications/notifications.module';
import { Notification } from './notifications/models/notification.model';
import { FollowUpManagementModule } from './follow-up-management/follow-up-management.module';
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
} from './tasks/models';

import { ChatModule } from './chat/chat.module';
import {
  Conversation,
  ConversationSetting,
  ConversationMember,
  Message,
  MessageReaction,
  MessageAttachment,
  MessageMention,
  MessageReadState,
  MessageVersion,
  MessagePin,
  MessagePoll,
  MessagePollOption,
  MessagePollVote,
  ConversationDraft,
  ConversationLabel,
  ConversationLabelMap,
  ConversationTemplate,
  ChatPolicy,
  ChatFeatureFlag,
  ScheduledMessage,
  ConversationPermissionOverride,
  RetentionPolicy,
} from './chat/models';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100, // global default limit: 100 requests per minute
      },
    ]),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const env = configService.get<string>('NODE_ENV') || 'development';
        const isDevelopment = env === 'development' || env === 'test';
        const shouldSync =
          isDevelopment && configService.get<string>('DB_SYNC') === 'true';

        return {
          dialect: 'postgres',
          host: configService.get<string>('DB_HOST'),
          port: configService.get<number>('DB_PORT'),
          username: configService.get<string>('DB_USERNAME'),
          password: configService.get<string>('DB_PASSWORD'),
          database: configService.get<string>('DB_NAME'),
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
            PartnerRole,
            Product,
            Partner,
            PartnerContact,
            PartnerProduct,
            PartnerFollowUp,
            PartnerDnbReport,
            PartnerRoleDynamicConfig,
            PartnerDynamicConfigHistory,
            PartnerDynamicValues,
            BagType,
            PackingType,
            BagSpecification,
            ProductBagAssignment,
            Currency,

            ShipmentType,
            PaymentTerm,
            TradeDocument,
            SalesContract,
            SalesContractItem,
            SalesContractShipment,
            SalesContractDocument,
            SalesContractDocumentFile,
            Attachment,
            PurchaseContract,
            PurchaseContractShipment,
            PurchaseContractRequiredDocument,
            PurchaseContractActivity,
            PurchaseContractAttachment,
            Enquiry,
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
            Notification,
            Conversation,
            ConversationSetting,
            ConversationMember,
            Message,
            MessageReaction,
            MessageAttachment,
            MessageMention,
            MessageReadState,
            MessageVersion,
            MessagePin,
            MessagePoll,
            MessagePollOption,
            MessagePollVote,
            ConversationDraft,
            ConversationLabel,
            ConversationLabelMap,
            ConversationTemplate,
            ChatPolicy,
            ChatFeatureFlag,
            ScheduledMessage,
            ConversationPermissionOverride,
            RetentionPolicy,
          ],
          autoLoadModels: true,
          synchronize: shouldSync,
          sync: { alter: shouldSync, force: false },
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
    AuditModule,
    HrmsModule,
    AttachmentsModule,
    SystemModule,
    HolidaysModule,
    ProfileModule,
    AttendanceModule,
    MastersModule,
    TasksModule,
    SalesContractsModule,
    PurchaseContractsModule,
    EnquiriesModule,
    LocationsModule,
    NotificationsModule,
    FollowUpManagementModule,
    ChatModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuditMiddleware).forRoutes('*path');
  }
}
