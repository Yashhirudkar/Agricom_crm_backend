import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Sequelize } from 'sequelize-typescript';
import { InjectModel } from '@nestjs/sequelize';
import { Task } from '../models/task.model';
import { TaskTimeLogRepository } from '../repositories/task-time-log.repository';
import { ManualTimeEntryDto } from '../dto/task-time-log.dto';
import { TaskActivityService } from './task-activity.service';

@Injectable()
export class TaskTimeTrackingService {
  constructor(
    private readonly repo: TaskTimeLogRepository,
    private readonly activityService: TaskActivityService,
    private readonly eventEmitter: EventEmitter2,
    private readonly sequelize: Sequelize,
    @InjectModel(Task) private readonly taskModel: typeof Task,
  ) {}

  private async assertTask(taskId: number, clientId: number): Promise<Task> {
    const task = await this.taskModel.findOne({
      where: { id: taskId, clientId },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async start(taskId: number, clientId: number, userId: number) {
    await this.assertTask(taskId, clientId);
    const active = await this.repo.findActiveSession(
      taskId,
      userId,
      clientId,
    );
    if (active)
      throw new BadRequestException(
        'A timer session is already running for this task',
      );

    const log = await this.repo.create({
      taskId,
      clientId,
      userId,
      startedAt: new Date(),
      durationMinutes: 0,
      isManual: false,
    });

    this.eventEmitter.emit('time.started', { taskId, clientId, userId });
    await this.activityService.logEvent(
      taskId,
      clientId,
      userId,
      'time_started',
    );
    return log;
  }

  async pause(taskId: number, clientId: number, userId: number) {
    await this.assertTask(taskId, clientId);
    const session = await this.repo.findActiveSession(
      taskId,
      userId,
      clientId,
    );
    if (!session)
      throw new BadRequestException('No active timer session to pause');
    if (session.pausedAt)
      throw new BadRequestException('Timer is already paused');

    const [, [updated]] = await this.repo.update(session.id, {
      pausedAt: new Date(),
    });
    this.eventEmitter.emit('time.paused', { taskId, clientId, userId });
    return updated;
  }

  async resume(taskId: number, clientId: number, userId: number) {
    await this.assertTask(taskId, clientId);
    const session = await this.repo.findActiveSession(
      taskId,
      userId,
      clientId,
    );
    if (!session)
      throw new BadRequestException('No active timer session found');
    if (!session.pausedAt) throw new BadRequestException('Timer is not paused');

    // Add paused duration to accumulated minutes
    const pausedMs =
      new Date().getTime() - new Date(session.pausedAt).getTime();
    const pausedMinutes = Math.floor(pausedMs / 60000);
    const newDuration = (session.durationMinutes || 0) + pausedMinutes;

    const [, [updated]] = await this.repo.update(session.id, {
      pausedAt: null,
      durationMinutes: newDuration,
    });
    return updated;
  }

  async stop(taskId: number, clientId: number, userId: number) {
    const transaction = await this.sequelize.transaction();
    try {
      await this.assertTask(taskId, clientId);
      const session = await this.repo.findActiveSession(
        taskId,
        userId,
        clientId,
      );
      if (!session)
        throw new BadRequestException('No active timer session to stop');

      const endTime = new Date();
      const startTime = new Date(session.startedAt);
      const totalMs = endTime.getTime() - startTime.getTime();

      // Subtract any paused time already accounted for
      const totalMinutes = Math.max(
        1,
        Math.floor(totalMs / 60000) -
          (session.durationMinutes || 0) +
          (session.durationMinutes || 0),
      );

      const [, [updated]] = await this.repo.update(
        session.id,
        {
          endedAt: endTime,
          durationMinutes: Math.max(1, Math.floor(totalMs / 60000)),
        },
        transaction,
      );

      // Update task.actualMinutes
      const totalActual = await this.repo.sumMinutesByTask(taskId, clientId);
      await this.taskModel.update(
        { actualMinutes: totalActual },
        {
          where: { id: taskId, clientId },
          transaction,
        },
      );

      await transaction.commit();

      this.eventEmitter.emit('time.stopped', { taskId, clientId, userId });
      await this.activityService.logEvent(
        taskId,
        clientId,
        userId,
        'time_stopped',
      );
      return updated;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  async manualEntry(
    taskId: number,
    clientId: number,
    userId: number,
    dto: ManualTimeEntryDto,
  ) {
    const transaction = await this.sequelize.transaction();
    try {
      await this.assertTask(taskId, clientId);

      const log = await this.repo.create(
        {
          taskId,
          clientId,
          userId,
          startedAt: new Date(),
          endedAt: new Date(),
          durationMinutes: dto.durationMinutes,
          isManual: true,
          notes: dto.notes ?? null,
        },
        transaction,
      );

      // Update task.actualMinutes
      const totalActual = await this.repo.sumMinutesByTask(taskId, clientId);
      await this.taskModel.update(
        { actualMinutes: totalActual },
        {
          where: { id: taskId, clientId },
          transaction,
        },
      );

      await transaction.commit();
      await this.activityService.logEvent(
        taskId,
        clientId,
        userId,
        'time_manual_entry',
      );
      return log;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  async getLogs(taskId: number, clientId: number) {
    await this.assertTask(taskId, clientId);
    return this.repo.findAllByTask(taskId, clientId);
  }
}
