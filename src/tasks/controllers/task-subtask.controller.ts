import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { TaskSubtaskService } from '../services/task-subtask.service';
import { CreateTaskDto } from '../dto';

@ApiTags('Task Subtasks')
@Controller('v1/tasks/:id/subtasks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TaskSubtaskController {
  constructor(private readonly subtaskService: TaskSubtaskService) {}

  @Get()
  @RequirePermission('task:view')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Get nested subtasks for a specific task' })
  async getSubtasks(
    @Req() req: any,
    @Param('id', ParseIntPipe) taskId: number,
  ) {
    const clientId = req.user?.clientId || 1;
    const subtasks = await this.subtaskService.findAllSubtasks(
      taskId,
      clientId,
    );
    return { success: true, data: subtasks };
  }

  @Post()
  @RequirePermission('task:create')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a new nested subtask' })
  async createSubtask(
    @Req() req: any,
    @Param('id', ParseIntPipe) taskId: number,
    @Body() dto: CreateTaskDto,
  ) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.id || 1;
    const subtask = await this.subtaskService.createSubtask(
      taskId,
      clientId,
      userId,
      dto,
    );
    return { success: true, message: 'Subtask created', data: subtask };
  }

  @Patch('reorder')
  @RequirePermission('task:edit')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Reorder subtasks' })
  async reorderSubtasks(
    @Req() req: any,
    @Param('id', ParseIntPipe) taskId: number,
    @Body('subtaskIds') subtaskIds: number[],
  ) {
    const clientId = req.user?.clientId || 1;
    await this.subtaskService.reorderSubtasks(taskId, clientId, subtaskIds);
    return { success: true, message: 'Subtasks reordered' };
  }

  @Patch(':subtaskId')
  @RequirePermission('task:edit')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Update a specific subtask properties' })
  async updateSubtask(
    @Req() req: any,
    @Param('id', ParseIntPipe) taskId: number,
    @Param('subtaskId', ParseIntPipe) subtaskId: number,
    @Body() dto: any,
  ) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.id || 1;
    const subtask = await this.subtaskService.updateSubtask(
      taskId,
      subtaskId,
      clientId,
      userId,
      dto,
    );
    return { success: true, message: 'Subtask updated', data: subtask };
  }

  @Delete(':subtaskId')
  @RequirePermission('task:delete')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Delete a specific subtask' })
  async deleteSubtask(
    @Req() req: any,
    @Param('id', ParseIntPipe) taskId: number,
    @Param('subtaskId', ParseIntPipe) subtaskId: number,
  ) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.id || 1;
    await this.subtaskService.deleteSubtask(
      taskId,
      subtaskId,
      clientId,
      userId,
    );
    return { success: true, message: 'Subtask deleted' };
  }
}
