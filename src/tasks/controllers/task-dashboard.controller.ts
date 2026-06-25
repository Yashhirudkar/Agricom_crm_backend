import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InjectModel } from '@nestjs/sequelize';
import { Task, TaskAssignee, TaskStatus } from '../models';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';

@ApiTags('Task Dashboard')
@Controller('v1/tasks/dashboard')
export class TaskDashboardController {
  constructor(
    @InjectModel(Task) private readonly taskModel: typeof Task,
    @InjectModel(TaskStatus)
    private readonly taskStatusModel: typeof TaskStatus,
    @InjectModel(TaskAssignee)
    private readonly taskAssigneeModel: typeof TaskAssignee,
    private readonly sequelize: Sequelize,
  ) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Get aggregated task statistics for the dashboard' })
  async getStats(@Req() req: any) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.id || 1;

    // Simple implementation of dashboard stats for the current user
    // 1. Total Assigned Tasks
    const assignedTasksCount = await this.taskAssigneeModel.count({
      where: { userId, clientId },
    });

    // 2. Overdue Tasks
    const overdueTasksCount = await this.taskModel.count({
      where: {
        clientId,
        dueDate: { [Op.lt]: new Date() },
        isArchived: false,
      },
      include: [
        {
          model: TaskAssignee,
          where: { userId },
          required: true,
        },
        {
          model: TaskStatus,
          where: { isCompleted: false },
          required: true,
        },
      ],
    });

    // 3. Completed Tasks Today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endToday = new Date();
    endToday.setHours(23, 59, 59, 999);

    const completedTodayCount = await this.taskModel.count({
      where: {
        clientId,
        updatedAt: { [Op.between]: [today, endToday] },
      },
      include: [
        {
          model: TaskAssignee,
          where: { userId },
          required: true,
        },
        {
          model: TaskStatus,
          where: { isCompleted: true },
          required: true,
        },
      ],
    });

    return {
      success: true,
      data: {
        assignedTasks: assignedTasksCount,
        overdueTasks: overdueTasksCount,
        completedToday: completedTodayCount,
      },
    };
  }
}
