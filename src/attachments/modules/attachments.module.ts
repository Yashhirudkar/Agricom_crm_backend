import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AttachmentsController } from '../controllers/attachments.controller';
import { AttachmentsService } from '../services/attachments.service';
import { RbacModule } from '../../rbac/modules/rbac.module';
import { Attachment } from '../models/attachment.model';
import { STORAGE_PROVIDER } from '../providers/storage.provider';
import { LocalStorageProvider } from '../providers/local-storage.provider';

@Module({
  imports: [
    SequelizeModule.forFeature([Attachment]),
    RbacModule
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
