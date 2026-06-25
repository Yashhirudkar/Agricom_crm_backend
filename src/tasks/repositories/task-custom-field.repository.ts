import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { TaskCustomField } from '../models/task-custom-field.model';
import { TaskCustomFieldValue } from '../models/task-custom-field-value.model';

@Injectable()
export class TaskCustomFieldRepository {
  constructor(
    @InjectModel(TaskCustomField)
    private readonly fieldModel: typeof TaskCustomField,
    @InjectModel(TaskCustomFieldValue)
    private readonly valueModel: typeof TaskCustomFieldValue,
  ) {}

  // Field definitions
  async createField(data: Partial<TaskCustomField>): Promise<TaskCustomField> {
    return this.fieldModel.create(data);
  }

  async findFieldsByClient(clientId: number): Promise<TaskCustomField[]> {
    return this.fieldModel.findAll({
      where: { clientId, isActive: true },
      order: [['name', 'ASC']],
    });
  }

  async findFieldById(
    id: number,
    clientId: number,
  ): Promise<TaskCustomField | null> {
    return this.fieldModel.findOne({ where: { id, clientId } });
  }

  async updateField(
    id: number,
    clientId: number,
    data: Partial<TaskCustomField>,
  ): Promise<[number, TaskCustomField[]]> {
    return this.fieldModel.update(data, {
      where: { id, clientId },
      returning: true,
    });
  }

  async deleteField(id: number, clientId: number): Promise<number> {
    return this.fieldModel.destroy({ where: { id, clientId } });
  }

  // Values
  async upsertValue(
    data: Partial<TaskCustomFieldValue>,
    transaction?: Transaction,
  ): Promise<TaskCustomFieldValue> {
    const existing = await this.valueModel.findOne({
      where: {
        taskId: data.taskId,
        customFieldId: data.customFieldId,
        clientId: data.clientId,
      },
    });
    if (existing) {
      await existing.update(data as any, { transaction });
      return existing;
    }
    return this.valueModel.create(data, { transaction });
  }

  async findValuesByTask(
    taskId: number,
    clientId: number,
  ): Promise<TaskCustomFieldValue[]> {
    return this.valueModel.findAll({
      where: { taskId, clientId },
      include: [{ model: TaskCustomField }],
    });
  }

  async findValueById(
    id: number,
    clientId: number,
  ): Promise<TaskCustomFieldValue | null> {
    return this.valueModel.findOne({ where: { id, clientId } });
  }

  async updateValue(
    id: number,
    clientId: number,
    data: Partial<TaskCustomFieldValue>,
  ): Promise<[number, TaskCustomFieldValue[]]> {
    return this.valueModel.update(data, {
      where: { id, clientId },
      returning: true,
    });
  }
}
