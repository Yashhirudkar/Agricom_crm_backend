import {
  Controller,
  Get,
  Post,
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
import { TaskDependencyService } from '../services/task-dependency.service';
import { CreateTaskDependencyDto } from '../dto/task-dependency.dto';

@ApiTags('Task Dependencies')
@Controller('v1/tasks/:taskId/dependencies')
@UseGuards(JwtAuthGuard)
export class TaskDependencyController {
  constructor(private readonly service: TaskDependencyService) {}

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Create a dependency between tasks (validates circular deps)',
  })
  async create(
    @Req() req: any,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: CreateTaskDependencyDto,
  ) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.userId || req.user?.id || 1;
    const dep = await this.service.create(taskId, clientId, userId, dto);
    return { success: true, message: 'Dependency created', data: dep };
  }

  @Get()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'List all dependencies for a task' })
  async findAll(
    @Req() req: any,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    const clientId = req.user?.clientId || 1;
    const deps = await this.service.findAll(taskId, clientId);
    return { success: true, data: deps };
  }

  @Delete(':dependencyId')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Remove a task dependency' })
  async remove(
    @Req() req: any,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('dependencyId', ParseIntPipe) dependencyId: number,
  ) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.userId || req.user?.id || 1;
    await this.service.delete(taskId, clientId, dependencyId, userId);
    return { success: true, message: 'Dependency removed' };
  }
}
