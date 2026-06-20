import { Index, Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  CreatedAt,
  UpdatedAt,
  Default, } from 'sequelize-typescript';
import { Company } from '../../companies/models/company.model';
import { Employee } from './employee.model';
import { LeaveType } from './leave-type.model';

@Table({
  tableName: 'employee_leave_balances',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['employeeId', 'leaveTypeId', 'year'],
    },
  ],
})
export class EmployeeLeaveBalance extends Model<EmployeeLeaveBalance> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare companyId: number;

  @BelongsTo(() => Company)
  declare company: Company;

  @ForeignKey(() => Employee)
  @AllowNull(false)
  @Index
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare employeeId: number;

  @BelongsTo(() => Employee)
  declare employee: Employee;

  @ForeignKey(() => LeaveType)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'RESTRICT' })
  declare leaveTypeId: number;

  @BelongsTo(() => LeaveType)
  declare leaveType: LeaveType;

  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare year: number;

  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(5, 2) })
  declare totalAllocated: number;

  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(5, 2) })
  declare usedDays: number;

  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(5, 2) })
  declare pendingDays: number;

  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(5, 2) })
  declare remainingDays: number;

  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(5, 2) })
  declare carryForwardDays: number;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
