import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { TaskDependency } from '../models/task-dependency.model';

@Injectable()
export class TaskDependencyRepository {
  constructor(
    @InjectModel(TaskDependency)
    private readonly model: typeof TaskDependency,
  ) {}

  async create(
    data: Partial<TaskDependency>,
    transaction?: Transaction,
  ): Promise<TaskDependency> {
    return this.model.create(data, { transaction });
  }

  async findAllByTask(
    taskId: number,
    clientId: number,
  ): Promise<TaskDependency[]> {
    return this.model.findAll({ where: { taskId, clientId } });
  }

  async findById(id: number, clientId: number): Promise<TaskDependency | null> {
    return this.model.findOne({ where: { id, clientId } });
  }

  async findExisting(
    taskId: number,
    dependsOnTaskId: number,
    clientId: number,
  ): Promise<TaskDependency | null> {
    return this.model.findOne({ where: { taskId, dependsOnTaskId, clientId } });
  }

  async delete(
    id: number,
    clientId: number,
    transaction?: Transaction,
  ): Promise<number> {
    return this.model.destroy({ where: { id, clientId }, transaction });
  }

  /** Returns all task IDs that the given taskId directly depends on */
  async getDirectDependencies(
    taskId: number,
    clientId: number,
  ): Promise<number[]> {
    const rows = await this.model.findAll({
      where: { taskId, clientId },
      attributes: ['dependsOnTaskId'],
    });
    return rows.map((r) => r.dependsOnTaskId);
  }
}
