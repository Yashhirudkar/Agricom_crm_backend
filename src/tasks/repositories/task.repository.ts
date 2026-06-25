import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { Task, TaskAssignee, TaskLabelMap } from '../models';
import { CreateTaskDto, UpdateTaskDto } from '../dto';

@Injectable()
export class TaskRepository {
  constructor(
    @InjectModel(Task)
    private readonly taskModel: typeof Task,
    @InjectModel(TaskAssignee)
    private readonly taskAssigneeModel: typeof TaskAssignee,
    @InjectModel(TaskLabelMap)
    private readonly taskLabelMapModel: typeof TaskLabelMap,
  ) {}

  async create(data: Partial<Task>, transaction?: Transaction): Promise<Task> {
    return this.taskModel.create(data, { transaction });
  }

  async update(
    id: number,
    clientId: number,
    data: Partial<Task>,
    transaction?: Transaction,
  ): Promise<[number, Task[]]> {
    return this.taskModel.update(data, {
      where: { id, clientId },
      returning: true,
      transaction,
    });
  }

  async findByIdAndClient(
    id: number,
    clientId: number,
    transaction?: Transaction,
  ): Promise<Task | null> {
    return this.taskModel.findOne({
      where: { id, clientId },
      transaction,
    });
  }

  async softDelete(
    id: number,
    clientId: number,
    transaction?: Transaction,
  ): Promise<number> {
    return this.taskModel.destroy({
      where: { id, clientId },
      transaction,
    });
  }

  async setAssignees(
    taskId: number,
    clientId: number,
    assigneeIds: number[],
    assignedById: number,
    transaction?: Transaction,
  ): Promise<void> {
    await this.taskAssigneeModel.destroy({
      where: { taskId, clientId },
      transaction,
    });
    if (assigneeIds && assigneeIds.length > 0) {
      const records = assigneeIds.map((userId) => ({
        taskId,
        clientId,
        userId: userId,
        assignedById,
      }));
      await this.taskAssigneeModel.bulkCreate(records, { transaction });
    }
  }

  async setLabels(
    taskId: number,
    clientId: number,
    labelIds: number[],
    transaction?: Transaction,
  ): Promise<void> {
    await this.taskLabelMapModel.destroy({
      where: { taskId, clientId },
      transaction,
    });
    if (labelIds && labelIds.length > 0) {
      const records = labelIds.map((labelId) => ({
        taskId,
        clientId,
        labelId,
      }));
      await this.taskLabelMapModel.bulkCreate(records, { transaction });
    }
  }
}
