import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

// ─── Models ──────────────────────────────────────────────────────────────────
import { Notification } from './models/notification.model';
import { NotificationLog } from './models/notification-log.model';
import { User } from '../users/models/user.model';
import { UserPreference } from '../users/models/user-preference.model';
import { Company } from '../companies/models/company.model';

// ─── Existing (in-app Socket.IO notifications) ───────────────────────────────
import { NotificationsGateway } from './gateways/notifications.gateway';
import { NotificationsService } from './services/notifications.service';
import { NotificationsController } from './controllers/notifications.controller';

// ─── WhatsApp / Outbound dispatch ────────────────────────────────────────────
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { NotificationDispatchService } from './services/notification-dispatch.service';
import { NotificationRetryWorker } from './services/notification-retry.worker';
import { WhatsAppAdminController } from './controllers/whatsapp-admin.controller';

import { RbacModule } from '../rbac/modules/rbac.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Notification,
      NotificationLog,
      User,
      UserPreference,
      Company,
    ]),

    // Internal WhatsApp sub-module — never import directly from feature modules
    WhatsAppModule,

    RbacModule,

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (configService.get<string>('JWT_ACCESS_EXPIRES') || '15m') as any,
        },
      }),
    }),
  ],

  controllers: [
    NotificationsController,   // existing in-app notifications
    WhatsAppAdminController,   // QR status + delivery stats (super admin protected)
  ],

  providers: [
    // Existing
    NotificationsService,
    NotificationsGateway,
    // Outbound dispatch
    NotificationDispatchService,
    NotificationRetryWorker,   // @Cron worker — DB-driven persistent retry
  ],

  exports: [
    NotificationsService,
    NotificationsGateway,
    NotificationDispatchService, // exported so feature modules can call send()
  ],
})
export class NotificationsModule {}
