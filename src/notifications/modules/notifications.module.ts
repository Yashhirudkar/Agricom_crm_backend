import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Notification } from '../models/notification.model';
import { NotificationsService } from '../services/notifications.service';
import { NotificationsController } from '../controllers/notifications.controller';
import { RbacModule } from '../../rbac/modules/rbac.module';

@Module({
  imports: [
    SequelizeModule.forFeature([Notification]),
    RbacModule,
  ],
  providers: [NotificationsService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
