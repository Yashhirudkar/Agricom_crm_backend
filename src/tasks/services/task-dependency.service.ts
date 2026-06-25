import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/sequelize';
import { Task } from '../models/task.model';
import { TaskDependencyRepository } from '../repositories/task-dependency.repository';
import { CreateTaskDependencyDto } from '../dto/task-dependency.dto';
import { TaskActivityService } from './task-activity.service';

@Injectable()
export class TaskDependencyService {
  constructor(
    private readonly repo: TaskDependencyRepository,
    private readonly activityService: TaskActivityService,
    private readonly eventEmitter: EventEmitter2,
    @InjectModel(Task) private readonly taskModel: typeof Task,
  ) {}

  /**
   * BFS-based circular dependency detection.
   * Checks if adding edge (taskId → newDependsOnTaskId) would create a cycle.
   */
  private async wouldCreateCycle(
    taskId: number,
    newDependsOnTaskId: number,
    clientId: number,
  ): Promise<boolean> {
    // If newDependsOnTaskId already depends (directly or transitively) on taskId → cycle
    const visited = new Set<number>();
    const queue = [newDependsOnTaskId];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === taskId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const deps = await this.repo.getDirectDependencies(current, clientId);
      queue.push(...deps);
    }
    return false;
  }

  async create(
    taskId: number,
    clientId: number,
    userId: number,
    dto: CreateTaskDependencyDto,
  ) {
    if (taskId === dto.dependsOnTaskId)
      throw new BadRequestException('A task cannot depend on itself');

    const task = await this.taskModel.findOne({
      where: { id: taskId, clientId },
    });
    if (!task) throw new NotFoundException('Task not found');

    const target = await this.taskModel.findOne({
      where: { id: dto.dependsOnTaskId, clientId },
    });
    if (!target)
      throw new NotFoundException(
        'Target task not found or does not belong to this tenant',
      );

    const existing = await this.repo.findExisting(
      taskId,
      dto.dependsOnTaskId,
      clientId,
    );
    if (existing) throw new ConflictException('Dependency already exists');

    if (await this.wouldCreateCycle(taskId, dto.dependsOnTaskId, clientId))
      throw new BadRequestException(
        'Adding this dependency would create a circular dependency loop',
      );

    const dep = await this.repo.create({
      taskId,
      clientId,
      dependsOnTaskId: dto.dependsOnTaskId,
      dependencyType: dto.dependencyType,
    });

    await this.activityService.logEvent(
      taskId,
      clientId,
      userId,
      'dependency_created',
    );
    this.eventEmitter.emit('dependency.created', {
      taskId,
      clientId,
      dependsOnTaskId: dto.dependsOnTaskId,
    });

    return dep;
  }

  async findAll(taskId: number, clientId: number) {
    const task = await this.taskModel.findOne({
      where: { id: taskId, clientId },
    });
    if (!task) throw new NotFoundException('Task not found');
    return this.repo.findAllByTask(taskId, clientId);
  }

  async delete(
    taskId: number,
    clientId: number,
    dependencyId: number,
    userId: number,
  ) {
    const dep = await this.repo.findById(dependencyId, clientId);
    if (!dep || dep.taskId !== taskId)
      throw new NotFoundException('Dependency not found');

    await this.repo.delete(dependencyId, clientId);
    await this.activityService.logEvent(
      taskId,
      clientId,
      userId,
      'dependency_removed',
    );
    this.eventEmitter.emit('dependency.removed', {
      taskId,
      clientId,
      dependencyId,
    });

    return { success: true };
  }
}
