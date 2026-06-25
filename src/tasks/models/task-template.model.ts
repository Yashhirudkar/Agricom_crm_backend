import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  ForeignKey,
  BelongsTo,
  HasMany,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { Client } from '../../clients/models/client.model';
import { User } from '../../users/models/user.model';
import { TaskTemplateItem } from './task-template-item.model';

@Table({
  tableName: 'task_templates',
  timestamps: true,
})
export class TaskTemplate extends Model<TaskTemplate> {
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

  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare title: string;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare description: string | null;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare createdByUserId: number;

  @BelongsTo(() => User, 'createdByUserId')
  declare createdBy: User;

  @HasMany(() => TaskTemplateItem)
  declare items: TaskTemplateItem[];

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
