import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TaskCustomFieldRepository } from '../repositories/task-custom-field.repository';
import {
  CreateCustomFieldDto,
  UpdateCustomFieldDto,
  SetCustomFieldValueDto,
} from '../dto/task-custom-field.dto';
import { InjectModel } from '@nestjs/sequelize';
import { Task } from '../models/task.model';

@Injectable()
export class TaskCustomFieldService {
  constructor(
    private readonly repo: TaskCustomFieldRepository,
    @InjectModel(Task) private readonly taskModel: typeof Task,
  ) {}

  // ── Field Definitions ──────────────────────────────────────────
  async createField(clientId: number, dto: CreateCustomFieldDto) {
    return this.repo.createField({
      clientId,
      name: dto.name,
      fieldType: dto.fieldType as any,
      options: dto.options ?? null,
      isRequired: dto.isRequired ?? false,
      isActive: true,
    });
  }

  async listFields(clientId: number) {
    return this.repo.findFieldsByClient(clientId);
  }

  async updateField(
    clientId: number,
    fieldId: number,
    dto: UpdateCustomFieldDto,
  ) {
    const field = await this.repo.findFieldById(fieldId, clientId);
    if (!field) throw new NotFoundException('Custom field not found');
    const [, [updated]] = await this.repo.updateField(fieldId, clientId, dto);
    return updated;
  }

  async deleteField(clientId: number, fieldId: number) {
    const field = await this.repo.findFieldById(fieldId, clientId);
    if (!field) throw new NotFoundException('Custom field not found');
    await this.repo.deleteField(fieldId, clientId);
    return { success: true };
  }

  // ── Task Field Values ──────────────────────────────────────────
  async setTaskFieldValue(
    taskId: number,
    clientId: number,
    dto: SetCustomFieldValueDto,
  ) {
    const task = await this.taskModel.findOne({
      where: { id: taskId, clientId },
    });
    if (!task) throw new NotFoundException('Task not found');

    const field = await this.repo.findFieldById(dto.customFieldId, clientId);
    if (!field || !field.isActive)
      throw new NotFoundException('Custom field not found or inactive');

    // Validate required fields
    const hasValue =
      dto.textValue !== undefined ||
      dto.numberValue !== undefined ||
      dto.dateValue !== undefined ||
      dto.booleanValue !== undefined;

    if (field.isRequired && !hasValue)
      throw new BadRequestException(`Field "${field.name}" is required`);

    return this.repo.upsertValue({
      taskId,
      clientId,
      customFieldId: dto.customFieldId,
      textValue: dto.textValue ?? null,
      numberValue: dto.numberValue ?? null,
      dateValue: dto.dateValue ? new Date(dto.dateValue) : null,
      booleanValue: dto.booleanValue ?? null,
    });
  }

  async getTaskFieldValues(taskId: number, clientId: number) {
    const task = await this.taskModel.findOne({
      where: { id: taskId, clientId },
    });
    if (!task) throw new NotFoundException('Task not found');
    return this.repo.findValuesByTask(taskId, clientId);
  }

  async updateTaskFieldValue(
    taskId: number,
    clientId: number,
    valueId: number,
    dto: Partial<SetCustomFieldValueDto>,
  ) {
    const value = await this.repo.findValueById(valueId, clientId);
    if (!value || value.taskId !== taskId)
      throw new NotFoundException('Field value not found');
    const [, [updated]] = await this.repo.updateValue(
      valueId,
      clientId,
      dto as any,
    );
    return updated;
  }
}
