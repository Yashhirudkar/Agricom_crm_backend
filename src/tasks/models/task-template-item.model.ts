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
  Default,
} from 'sequelize-typescript';
import { Client } from '../../clients/models/client.model';
import { TaskTemplate } from './task-template.model';

@Table({
  tableName: 'task_template_items',
  timestamps: true,
})
export class TaskTemplateItem extends Model<TaskTemplateItem> {
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

  @ForeignKey(() => TaskTemplate)
  @Index('task_template_items_template_id')
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare templateId: number;

  @BelongsTo(() => TaskTemplate)
  declare template: TaskTemplate;

  @ForeignKey(() => TaskTemplateItem)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare parentItemId: number | null;

  @BelongsTo(() => TaskTemplateItem)
  declare parentItem: TaskTemplateItem;

  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare title: string;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare description: string | null;

  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare estimatedMinutes: number | null;

  @AllowNull(false)
  @Default(0)
  @Column({ type: DataType.INTEGER })
  declare offsetDaysFromStart: number;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
