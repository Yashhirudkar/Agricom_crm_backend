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
import { TaskRecurrence } from './task-recurrence.model';
import { Company } from '../../companies/models/company.model';

@Table({
  tableName: 'task_recurrence_exceptions',
  timestamps: true,
})
export class TaskRecurrenceException extends Model<TaskRecurrenceException> {
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

  @ForeignKey(() => TaskRecurrence)
  @Index('task_recurrence_exceptions_recurrence_id')
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare recurrenceId: number;

  @BelongsTo(() => TaskRecurrence, { onDelete: 'CASCADE' })
  declare recurrence: TaskRecurrence;

  @AllowNull(false)
  @Column({ type: DataType.DATEONLY })
  declare skipDate: Date;

  @AllowNull(true)
  @Column({ type: DataType.STRING(255) })
  declare reason: string | null; // e.g., 'HOLIDAY'

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
