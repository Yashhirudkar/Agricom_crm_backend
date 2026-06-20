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
  Default,
  HasMany, } from 'sequelize-typescript';
import { Company } from '../../companies/models/company.model';
import { Employee } from './employee.model';
import { LeaveType } from './leave-type.model';
import { LeaveApprovalStep } from './leave-approval-step.model';
import { LeaveApprovalLog } from './leave-approval-log.model';
export enum LeaveRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum HalfDayType {
  FIRST_HALF = 'FIRST_HALF',
  SECOND_HALF = 'SECOND_HALF',
}

@Table({
  tableName: 'leave_requests',
  timestamps: true,
  indexes: [
    { fields: ['employeeId', 'status'] },
    { fields: ['employeeId', 'fromDate', 'toDate'] },
    { fields: ['companyId', 'status', 'fromDate', 'toDate'] },
  ],
})
export class LeaveRequest extends Model<LeaveRequest> {
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
  @Column({ type: DataType.DATEONLY })
  declare fromDate: Date;

  @AllowNull(false)
  @Column({ type: DataType.DATEONLY })
  declare toDate: Date;

  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(5, 2) })
  declare totalDays: number;

  @Default(false)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare isHalfDay: boolean;

  @AllowNull(true)
  @Column({
    type: DataType.ENUM('FIRST_HALF', 'SECOND_HALF'),
  })
  declare halfDayType: HalfDayType;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare reason: string;

  @Default(LeaveRequestStatus.PENDING)
  @AllowNull(false)
  @Column({
    type: DataType.ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'),
  })
  declare status: LeaveRequestStatus;

  @AllowNull(true)
  @Column({ type: DataType.STRING(1000) })
  declare attachmentPath: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare mimeType: string;

  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare fileSize: number;

  @Default(1)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare currentApprovalLevel: number;

  @Default(1)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare finalApprovalLevel: number;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare rejectedReason: string;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @HasMany(() => LeaveApprovalStep)
  declare approvalSteps: LeaveApprovalStep[];

  @HasMany(() => LeaveApprovalLog)
  declare approvalLogs: LeaveApprovalLog[];
}
