import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TaskChecklistService } from '../services/task-checklist.service';
import {
  CreateChecklistItemDto,
  UpdateChecklistItemDto,
  ReorderChecklistDto,
} from '../dto/task-checklist.dto';

@ApiTags('Task Checklists')
@Controller('v1/tasks/:taskId/checklists')
@UseGuards(JwtAuthGuard)
export class TaskChecklistController {
  constructor(private readonly service: TaskChecklistService) {}

  @Post()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a checklist item for a task' })
  async create(
    @Req() req: any,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: CreateChecklistItemDto,
  ) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.userId || req.user?.id || 1;
    const item = await this.service.create(taskId, clientId, userId, dto);
    return { success: true, message: 'Checklist item created', data: item };
  }

  @Get()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Get all checklist items for a task' })
  async findAll(
    @Req() req: any,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    const clientId = req.user?.clientId || 1;
    const items = await this.service.findAll(taskId, clientId);
    return { success: true, data: items };
  }

  @Patch('reorder')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Reorder checklist items by passing an ordered array of IDs',
  })
  async reorder(
    @Req() req: any,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: ReorderChecklistDto,
  ) {
    const clientId = req.user?.clientId || 1;
    const items = await this.service.reorder(taskId, clientId, dto);
    return { success: true, message: 'Checklist reordered', data: items };
  }

  @Patch(':checklistId')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Update a checklist item title or order' })
  async update(
    @Req() req: any,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('checklistId', ParseIntPipe) checklistId: number,
    @Body() dto: UpdateChecklistItemDto,
  ) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.userId || req.user?.id || 1;
    const item = await this.service.update(
      taskId,
      clientId,
      checklistId,
      userId,
      dto,
    );
    return { success: true, message: 'Checklist item updated', data: item };
  }

  @Patch(':checklistId/toggle')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Toggle checklist item complete/incomplete' })
  async toggle(
    @Req() req: any,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('checklistId', ParseIntPipe) checklistId: number,
  ) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.userId || req.user?.id || 1;
    const item = await this.service.toggle(
      taskId,
      clientId,
      checklistId,
      userId,
    );
    return { success: true, message: 'Checklist item toggled', data: item };
  }

  @Delete(':checklistId')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Delete a checklist item' })
  async remove(
    @Req() req: any,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('checklistId', ParseIntPipe) checklistId: number,
  ) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.userId || req.user?.id || 1;
    await this.service.delete(taskId, clientId, checklistId, userId);
    return { success: true, message: 'Checklist item deleted' };
  }
}
