import { Module } from '@nestjs/common';
import { AttachmentsController } from '../controllers/attachments.controller';
import { AttachmentsService } from '../services/attachments.service';
import { RbacModule } from '../../rbac/modules/rbac.module';

@Module({
  imports: [RbacModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
})
export class AttachmentsModule {}
