import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { TaskActivityService } from '../services/task-activity.service';

@ApiTags('Task Activities')
@Controller('v1/tasks/:taskId/activity')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TaskActivityController {
  constructor(private readonly activityService: TaskActivityService) {}

  @Get()
  @RequirePermission('task:view')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Get activity timeline for a specific task' })
  async getActivities(
    @Req() req: any,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const clientId = req.user?.clientId || 1;
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 20;

    const result = await this.activityService.getActivitiesForTask(
      taskId,
      clientId,
      pageNumber,
      limitNumber,
    );

    return {
      success: true,
      data: result.data,
      meta: result.meta,
    };
  }
}
