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

@Table({
  tableName: 'task_dependencies',
  timestamps: true,
})
export class TaskDependency extends Model<TaskDependency> {
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
  @Index('task_deps_task_id')
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare taskId: number;

  @BelongsTo(() => Task, 'taskId')
  declare task: Task;

  @ForeignKey(() => Task)
  @Index('task_deps_depends_on')
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare dependsOnTaskId: number;

  @BelongsTo(() => Task, 'dependsOnTaskId')
  declare dependsOnTask: Task;

  @AllowNull(false)
  @Column({
    type: DataType.STRING(50), // e.g., 'BLOCKS', 'BLOCKED_BY', 'WAITING_ON'
  })
  declare dependencyType: string;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
