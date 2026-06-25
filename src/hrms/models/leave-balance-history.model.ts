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
  CreatedAt,
  UpdatedAt,
  Default,
} from 'sequelize-typescript';
import { Company } from '../../companies/models/company.model';
import { Employee } from './employee.model';
import { LeaveType } from './leave-type.model';

@Table({
  tableName: 'leave_balance_history',
  timestamps: true,
})
export class LeaveBalanceHistory extends Model<LeaveBalanceHistory> {
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
  declare openingBalance: number;

  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(5, 2) })
  declare usedBalance: number;

  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(5, 2) })
  declare carryForward: number;

  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(5, 2) })
  declare closingBalance: number;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
