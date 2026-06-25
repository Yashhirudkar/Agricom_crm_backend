import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TaskAttachmentService } from '../services/task-attachment.service';
import { CreateTaskAttachmentDto } from '../dto/task-attachment.dto';

@ApiTags('Task Attachments')
@Controller('v1/tasks/:taskId/attachments')
export class TaskAttachmentController {
  constructor(private readonly attachmentService: TaskAttachmentService) {}

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Attach a file to a task' })
  async create(
    @Req() req: any,
    @Param('taskId') taskId: string,
    @Body() dto: CreateTaskAttachmentDto,
  ) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.id || 1;
    const attachment = await this.attachmentService.create(
      +taskId,
      clientId,
      userId,
      dto,
    );
    return {
      success: true,
      message: 'Attachment added successfully',
      data: attachment,
    };
  }

  @Get()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'List all attachments for a task' })
  async findAll(@Req() req: any, @Param('taskId') taskId: string) {
    const clientId = req.user?.clientId || 1;
    const attachments = await this.attachmentService.findAll(+taskId, clientId);
    return { success: true, data: attachments };
  }

  @Delete(':id')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Delete an attachment' })
  async remove(
    @Req() req: any,
    @Param('taskId') taskId: string,
    @Param('id') id: string,
  ) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.id || 1;
    const isManager = req.user?.role === 'Manager'; // Example role check
    await this.attachmentService.delete(
      +id,
      +taskId,
      clientId,
      userId,
      isManager,
    );
    return { success: true, message: 'Attachment deleted successfully' };
  }
}
