import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TaskCommentService } from '../services/task-comment.service';
import {
  CreateTaskCommentDto,
  UpdateTaskCommentDto,
} from '../dto/task-comment.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('Task Comments')
@Controller('v1/tasks/:taskId/comments')
@UseGuards(JwtAuthGuard)
export class TaskCommentController {
  constructor(private readonly commentService: TaskCommentService) {}

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Add a comment to a task (supports nested replies)',
  })
  async create(
    @Req() req: any,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: CreateTaskCommentDto,
  ) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.userId || req.user?.id || 1;
    const comment = await this.commentService.create(
      taskId,
      clientId,
      userId,
      dto,
    );
    return {
      success: true,
      message: 'Comment added successfully',
      data: comment,
    };
  }

  @Get()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'List all comments for a task (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Req() req: any,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    const clientId = req.user?.clientId || 1;
    const result = await this.commentService.findAll(
      taskId,
      clientId,
      +page,
      +limit,
    );
    return { success: true, data: result.data, meta: result.meta };
  }

  @Patch(':id')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Edit a comment (saves edit history, updates mentions)',
  })
  async update(
    @Req() req: any,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTaskCommentDto,
  ) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.userId || req.user?.id || 1;
    const comment = await this.commentService.update(
      id,
      taskId,
      clientId,
      userId,
      dto,
    );
    return {
      success: true,
      message: 'Comment updated successfully',
      data: comment,
    };
  }

  @Delete(':id')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Soft-delete a comment' })
  async remove(
    @Req() req: any,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.userId || req.user?.id || 1;
    await this.commentService.delete(id, taskId, clientId, userId);
    return { success: true, message: 'Comment deleted successfully' };
  }
}
