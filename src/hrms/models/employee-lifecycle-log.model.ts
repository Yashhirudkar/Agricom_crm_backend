import { Index, Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  CreatedAt, } from 'sequelize-typescript';
import { Employee, EmployeeStatus } from './employee.model';
import { User } from '../../users/models/user.model';

@Table({
  tableName: 'employee_lifecycle_logs',
  timestamps: true,
  updatedAt: false,
})
export class EmployeeLifecycleLog extends Model<EmployeeLifecycleLog> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Employee)
  @AllowNull(false)
  @Index
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare employeeId: number;

  @BelongsTo(() => Employee)
  declare employee: Employee;

  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare oldStatus: EmployeeStatus;

  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare newStatus: EmployeeStatus;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare changedBy: number;

  @BelongsTo(() => User, 'changedBy')
  declare changedByUser: User;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare remarks: string;

  @AllowNull(false)
  @Column({ type: DataType.DATE })
  declare effectiveDate: Date;

  @CreatedAt
  declare createdAt: Date;
}
