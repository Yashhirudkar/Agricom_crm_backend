import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { TaskTemplate } from '../models/task-template.model';
import { TaskTemplateItem } from '../models/task-template-item.model';
import { User } from '../../users/models/user.model';

@Injectable()
export class TaskTemplateRepository {
  constructor(
    @InjectModel(TaskTemplate)
    private readonly templateModel: typeof TaskTemplate,
    @InjectModel(TaskTemplateItem)
    private readonly itemModel: typeof TaskTemplateItem,
  ) {}

  async create(
    data: Partial<TaskTemplate>,
    transaction?: Transaction,
  ): Promise<TaskTemplate> {
    return this.templateModel.create(data, { transaction });
  }

  async findAll(clientId: number): Promise<TaskTemplate[]> {
    return this.templateModel.findAll({
      where: { clientId },
      include: [
        {
          model: User,
          as: 'createdBy',
          attributes: ['id', 'name', 'email'],
        },
        { model: TaskTemplateItem },
      ],
    });
  }

  async findById(id: number, clientId: number): Promise<TaskTemplate | null> {
    return this.templateModel.findOne({
      where: { id, clientId },
      include: [{ model: TaskTemplateItem }],
    });
  }

  async update(
    id: number,
    clientId: number,
    data: Partial<TaskTemplate>,
  ): Promise<[number, TaskTemplate[]]> {
    return this.templateModel.update(data, {
      where: { id, clientId },
      returning: true,
    });
  }

  async delete(id: number, clientId: number): Promise<number> {
    return this.templateModel.destroy({ where: { id, clientId } });
  }

  async getItems(templateId: number): Promise<TaskTemplateItem[]> {
    return this.itemModel.findAll({
      where: { templateId },
      order: [['orderIndex', 'ASC']],
    });
  }
}
