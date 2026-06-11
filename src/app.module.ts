import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { ScheduleModule } from '@nestjs/schedule';
import { ClientsModule } from './clients/modules/clients.module';
import { UsersModule } from './users/modules/users.module';
import { AuthModule } from './auth/modules/auth.module';
import { RbacModule } from './rbac/modules/rbac.module';
import { CompaniesModule } from './companies/modules/companies.module';
import { Client } from './clients/models/client.model';
import { User } from './users/models/user.model';
import { UserSession } from './users/models/user-session.model';
import { Role } from './rbac/models/role.model';
import { Permission } from './rbac/models/permission.model';
import { RolePermission } from './rbac/models/role-permission.model';
import { UserRole } from './rbac/models/user-role.model';
import { Company } from './companies/models/company.model';
import { UserCompany } from './users/models/user-company.model';
import { UserInvitation } from './users/models/user-invitation.model';
import { AuditLog } from './audit/models/audit-log.model';
import { Notification } from './notifications/models/notification.model';
import { Note } from './notes/models/note.model';
import { Tag } from './tags/models/tag.model';
import { Department } from './companies/models/department.model';
import { NotificationsModule } from './notifications/modules/notifications.module';
import { AuditModule } from './audit/modules/audit.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        dialect: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        models: [Client, Company, User, UserSession, Role, Permission, RolePermission, UserRole, UserCompany, UserInvitation, AuditLog, Notification, Note, Tag, Department],
        autoLoadModels: true,
        synchronize: true,
        sync: { alter: true },
        logging: false,
      }),
    }),
    ClientsModule,
    UsersModule,
    AuthModule,
    RbacModule,
    CompaniesModule,
    NotificationsModule,
    AuditModule,
  ],
})
export class AppModule {}



