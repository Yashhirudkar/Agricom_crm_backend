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
import { TaskLabel } from './task-label.model';

@Table({
  tableName: 'task_label_maps',
  timestamps: true,
})
export class TaskLabelMap extends Model<TaskLabelMap> {
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
  @Index('task_label_maps_task_id')
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare taskId: number;

  @BelongsTo(() => Task)
  declare task: Task;

  @ForeignKey(() => TaskLabel)
  @Index('task_label_maps_label_id')
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare labelId: number;

  @BelongsTo(() => TaskLabel)
  declare label: TaskLabel;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
