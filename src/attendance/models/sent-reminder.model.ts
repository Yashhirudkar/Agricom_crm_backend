import {
  Index,
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
} from 'sequelize-typescript';
import { Company } from '../../companies/models/company.model';
import { Employee } from '../../hrms/models/employee.model';

@Table({
  tableName: 'sent_reminders',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['companyId', 'employeeId', 'date', 'event'],
      name: 'sent_reminders_unique_event',
    },
  ],
})
export class SentReminder extends Model<SentReminder> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare companyId: number;

  @BelongsTo(() => Company, { onDelete: 'CASCADE' })
  declare company: Company;

  @ForeignKey(() => Employee)
  @AllowNull(false)
  @Index
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare employeeId: number;

  @BelongsTo(() => Employee, { onDelete: 'CASCADE' })
  declare employee: Employee;

  @AllowNull(false)
  @Column({ type: DataType.STRING(10) })
  declare date: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare event: string;

  @AllowNull(false)
  @Column({ type: DataType.DATE })
  declare sentAt: Date;
}
