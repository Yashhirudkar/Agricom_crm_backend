import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { TasksService } from '../services/tasks.service';
import {
  CreateTaskDto,
  UpdateTaskDto,
  ArchiveTaskDto,
  TaskQueryDto,
} from '../dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { TaskStatusTransitionRepository } from '../repositories/task-status-transition.repository';

@ApiTags('Tasks')
@Controller('v1/tasks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly transitionRepo: TaskStatusTransitionRepository,
  ) { }

  @Post()
  @RequirePermission('task:create')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a new task' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Required to prevent duplicate task creation',
  })
  async create(@Req() req: any, @Body() createTaskDto: CreateTaskDto) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.id || 1;
    const idempotencyKey = req.headers['idempotency-key'];

    if (!idempotencyKey) {
      // In a real implementation this would be caught by a Guard or Interceptor
      throw new Error('Idempotency-Key header is required');
    }

    const task = await this.tasksService.create(
      clientId,
      userId,
      createTaskDto,
    );
    return { success: true, message: 'Task created successfully', data: task };
  }

  @Get()
  @RequirePermission('task:view')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({
    summary: 'List tasks with advanced filtering and pagination',
  })
  async findAll(@Req() req: any, @Query() query: TaskQueryDto) {
    // Inject current user ID for presets like "assigned_by_me" or "my_tasks"
    const userId = req.user?.id || 1;
    const clientId = req.user?.clientId || 1;
    const result = await this.tasksService.findAll(clientId, userId, query);
    return { success: true, data: result.data, meta: result.meta };
  }

  @Get('meta/statuses')
  @RequirePermission('task:view')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Get available task statuses' })
  async getStatuses(@Req() req: any) {
    const clientId = req.user?.clientId || 1;
    const statuses = await this.tasksService.getStatuses(clientId);
    return { success: true, data: statuses };
  }

  @Get('meta/priorities')
  @RequirePermission('task:view')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Get available task priorities' })
  async getPriorities(@Req() req: any) {
    const clientId = req.user?.clientId || 1;
    const priorities = await this.tasksService.getPriorities(clientId);
    return { success: true, data: priorities };
  }

  @Get(':id')
  @RequirePermission('task:view')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Get deeply hydrated task details' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    const clientId = req.user?.clientId || 1;
    const task = await this.tasksService.findOne(+id, clientId);
    return { success: true, data: task };
  }

  @Patch(':id')
  @RequirePermission('task:update')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Update a task (requires version for optimistic locking)',
  })
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
  ) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.id || 1;
    const task = await this.tasksService.update(
      +id,
      clientId,
      userId,
      updateTaskDto,
    );
    return { success: true, message: 'Task updated successfully', data: task };
  }

  @Patch(':id/archive')
  @RequirePermission('task:update')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Archive or unarchive a task' })
  async archive(
    @Req() req: any,
    @Param('id') id: string,
    @Body() archiveTaskDto: ArchiveTaskDto,
  ) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.id || 1;
    const task = await this.tasksService.archive(
      +id,
      clientId,
      userId,
      archiveTaskDto,
    );
    return {
      success: true,
      message: archiveTaskDto.isArchived
        ? 'Task archived successfully'
        : 'Task unarchived successfully',
      data: task,
    };
  }

  @Patch(':id/restore')
  @RequirePermission('task:update')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Restore a soft-deleted task' })
  async restore(@Req() req: any, @Param('id') id: string) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.id || 1;
    await this.tasksService.restore(+id, clientId, userId);
    return { success: true, message: 'Task restored successfully' };
  }

  @Patch(':id/status')
  @RequirePermission('task:update')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Change task status (validates transition rules)' })
  async changeStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { statusId: number; version: number },
  ) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.id || 1;

    // Get current task to check fromStatusId
    const current = await this.tasksService.findOne(+id, clientId);
    if (current.statusId) {
      const allowed = await this.transitionRepo.isAllowed(
        clientId,
        current.statusId,
        body.statusId,
      );
      if (!allowed) {
        throw new BadRequestException(
          'This status transition is not permitted by your workflow rules',
        );
      }
    }

    const task = await this.tasksService.update(+id, clientId, userId, {
      statusId: body.statusId,
      version: body.version,
    });
    return {
      success: true,
      message: 'Status updated successfully',
      data: task,
    };
  }

  @Get('status-transitions')
  @RequirePermission('task:view')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({
    summary: 'Get all configured status transition rules for this tenant',
  })
  async getTransitions(@Req() req: any) {
    const clientId = req.user?.clientId || 1;
    const rules = await this.transitionRepo.findAllByClient(clientId);
    return { success: true, data: rules };
  }

  @Delete(':id')
  @RequirePermission('task:delete')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Soft delete a task' })
  async remove(@Req() req: any, @Param('id') id: string) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.id || 1;
    await this.tasksService.delete(+id, clientId, userId);
    return { success: true, message: 'Task deleted successfully' };
  }
}
