import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { PartnerFollowUp } from '../masters/partner/partner-followup.model';
import { Partner } from '../masters/partner/partner.model';
import { Notification } from '../notifications/models/notification.model';
import { NotificationsModule } from '../notifications/notifications.module';
import { RbacModule } from '../rbac/modules/rbac.module';
import { FollowUpManagementService } from './services/follow-up-management.service';
import { FollowUpNotificationService } from './services/follow-up-notification.service';
import { FollowUpSchedulerService } from './services/follow-up-scheduler.service';
import { FollowUpManagementController } from './controllers/follow-up-management.controller';
import { User } from '../users/models/user.model';

@Module({
  imports: [
    SequelizeModule.forFeature([PartnerFollowUp, Partner, Notification, User]),
    NotificationsModule,
    RbacModule,
  ],
  controllers: [FollowUpManagementController],
  providers: [
    FollowUpManagementService,
    FollowUpNotificationService,
    FollowUpSchedulerService,
  ],
  exports: [
    FollowUpManagementService,
    FollowUpNotificationService,
    FollowUpSchedulerService,
  ],
})
export class FollowUpManagementModule {}
