import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TaskTimeTrackingService } from '../services/task-time-tracking.service';
import { ManualTimeEntryDto } from '../dto/task-time-log.dto';

@ApiTags('Task Time Tracking')
@Controller('v1/tasks/:taskId/time')
@UseGuards(JwtAuthGuard)
export class TaskTimeTrackingController {
  constructor(private readonly service: TaskTimeTrackingService) {}

  @Post('start')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Start a timer session for a task' })
  async start(@Req() req: any, @Param('taskId', ParseIntPipe) taskId: number) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.userId || req.user?.id || 1;
    const log = await this.service.start(taskId, clientId, userId);
    return { success: true, message: 'Timer started', data: log };
  }

  @Post('pause')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Pause an active timer session' })
  async pause(@Req() req: any, @Param('taskId', ParseIntPipe) taskId: number) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.userId || req.user?.id || 1;
    const log = await this.service.pause(taskId, clientId, userId);
    return { success: true, message: 'Timer paused', data: log };
  }

  @Post('resume')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Resume a paused timer session' })
  async resume(@Req() req: any, @Param('taskId', ParseIntPipe) taskId: number) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.userId || req.user?.id || 1;
    const log = await this.service.resume(taskId, clientId, userId);
    return { success: true, message: 'Timer resumed', data: log };
  }

  @Post('stop')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Stop the timer and finalize duration (syncs actualMinutes)',
  })
  async stop(@Req() req: any, @Param('taskId', ParseIntPipe) taskId: number) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.userId || req.user?.id || 1;
    const log = await this.service.stop(taskId, clientId, userId);
    return { success: true, message: 'Timer stopped', data: log };
  }

  @Post('manual')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Add a manual time entry' })
  async manualEntry(
    @Req() req: any,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: ManualTimeEntryDto,
  ) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.userId || req.user?.id || 1;
    const log = await this.service.manualEntry(
      taskId,
      clientId,
      userId,
      dto,
    );
    return { success: true, message: 'Time entry added', data: log };
  }

  @Get('logs')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Get time log history for a task' })
  async getLogs(
    @Req() req: any,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    const clientId = req.user?.clientId || 1;
    const logs = await this.service.getLogs(taskId, clientId);
    return { success: true, data: logs };
  }
}
