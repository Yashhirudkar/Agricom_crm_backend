import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  Index,
} from 'sequelize-typescript';
import { Client } from '../../clients/models/client.model';
import { Task } from './task.model';
import { TaskCustomField } from './task-custom-field.model';

@Table({
  tableName: 'task_custom_field_values',
  timestamps: true,
})
export class TaskCustomFieldValue extends Model<TaskCustomFieldValue> {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  declare id: number;

  @ForeignKey(() => Client)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare clientId: number;

  @BelongsTo(() => Client)
  declare client: Client;

  @ForeignKey(() => Task)
  @Index('task_cfv_task_id')
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare taskId: number;

  @BelongsTo(() => Task)
  declare task: Task;

  @ForeignKey(() => TaskCustomField)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare customFieldId: number;

  @BelongsTo(() => TaskCustomField)
  declare customField: TaskCustomField;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare textValue: string | null;

  @AllowNull(true)
  @Column({ type: DataType.DECIMAL(10, 2) })
  declare numberValue: number | null;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare dateValue: Date | null;

  @AllowNull(true)
  @Column({ type: DataType.BOOLEAN })
  declare booleanValue: boolean | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
