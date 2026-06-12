import { Module } from '@nestjs/common';
import { AttachmentsController } from '../controllers/attachments.controller';
import { AttachmentsService } from '../services/attachments.service';

@Module({
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
})
export class AttachmentsModule {}
