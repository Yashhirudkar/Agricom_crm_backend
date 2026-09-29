import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WhatsAppService } from './whatsapp.service';

/**
 * Internal sub-module — only imported by NotificationsModule.
 * Never import WhatsAppModule directly from feature modules.
 *
 * Feature modules should import NotificationsModule and inject
 * NotificationDispatchService instead.
 */
@Module({
  imports: [ConfigModule],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
