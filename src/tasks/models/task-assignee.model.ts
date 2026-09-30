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
import { User } from '../../users/models/user.model';
import { Task } from './task.model';
import { Company } from '../../companies/models/company.model';


@Table({
  tableName: 'task_assignees',
  timestamps: true,
})
export class TaskAssignee extends Model<TaskAssignee> {

  @ForeignKey(() => Company)
  @AllowNull(true)
  @Column({ field: 'company_id', type: DataType.INTEGER })
  declare companyId: number;

  @BelongsTo(() => Company)
  declare company: Company;

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

  @BelongsTo(() => Client, { onDelete: 'CASCADE' })
  declare client: Client;

  @ForeignKey(() => Task)
  @Index('task_assignees_task_id')
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare taskId: number;

  @BelongsTo(() => Task, { onDelete: 'CASCADE' })
  declare task: Task;

  @ForeignKey(() => User)
  @Index('task_assignees_user_id')
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare userId: number;

  @BelongsTo(() => User, { foreignKey: 'userId', onDelete: 'CASCADE' })
  declare user: User;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare assignedById: number | null;

  @BelongsTo(() => User, { foreignKey: 'assignedById', onDelete: 'CASCADE' })
  declare assignedBy: User;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
