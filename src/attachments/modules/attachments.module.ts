import { Module, forwardRef } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AttachmentsController } from '../controllers/attachments.controller';
import { AttachmentsService } from '../services/attachments.service';
import { RbacModule } from '../../rbac/modules/rbac.module';
import { Attachment } from '../models/attachment.model';
import { MessageAttachment } from '../../chat/models/message-attachment.model';
import { Message } from '../../chat/models/message.model';
import { STORAGE_PROVIDER } from '../providers/storage.provider';
import { LocalStorageProvider } from '../providers/local-storage.provider';
import { ChatModule } from '../../chat/chat.module';
import { AuditModule } from '../../audit/modules/audit.module';

@Module({
  imports: [
    SequelizeModule.forFeature([Attachment, MessageAttachment, Message]),
    RbacModule,
    AuditModule,
    forwardRef(() => ChatModule),
  ],
  controllers: [AttachmentsController],
  providers: [
    AttachmentsService,
    {
      provide: STORAGE_PROVIDER,
      useClass: LocalStorageProvider,
    },
  ],
  exports: [AttachmentsService, STORAGE_PROVIDER],
})
export class AttachmentsModule {}
