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
import { Employee } from '../../hrms/models/employee.model';
import { AttendanceRecord } from './attendance-record.model';
import { Company } from '../../companies/models/company.model';
import { LeaveRequest } from '../../hrms/models/leave-request.model';
import { User } from '../../users/models/user.model';

export enum AttendanceExceptionType {
  MISSED_PUNCH = 'MISSED_PUNCH',
  MANUAL_ENTRY = 'MANUAL_ENTRY',
  REGULARIZATION = 'REGULARIZATION',
  OVERRIDE = 'OVERRIDE',
}

export enum AttendanceExceptionStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  OPEN = 'OPEN',
  UNDER_REVIEW = 'UNDER_REVIEW',
  RESOLVED = 'RESOLVED',
  CANCELLED = 'CANCELLED',
}


@Table({
  tableName: 'attendance_exceptions',
  timestamps: true,
  indexes: [
    { fields: ['employeeId', 'status'] },
    { fields: ['employeeId', 'attendanceRecordId'] },
  ],
})
export class AttendanceException extends Model<AttendanceException> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Employee)
  @AllowNull(false)
  @Index
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare employeeId: number;

  @BelongsTo(() => Employee, { foreignKey: 'employeeId', onDelete: 'CASCADE' })
  declare employee: Employee;

  @ForeignKey(() => AttendanceRecord)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare attendanceRecordId: number;

  @BelongsTo(() => AttendanceRecord, { onDelete: 'SET NULL' })
  declare attendanceRecord: AttendanceRecord;

  @AllowNull(true)
  @Column({
    type: DataType.ENUM(
      'MISSED_PUNCH',
      'MANUAL_ENTRY',
      'REGULARIZATION',
      'OVERRIDE',
    ),
  })
  declare type: AttendanceExceptionType | null;

  @AllowNull(false)
  @Column({ type: DataType.TEXT })
  declare reason: string;

  @Default(AttendanceExceptionStatus.PENDING)
  @AllowNull(false)
  @Column({
    type: DataType.STRING(50),
  })
  declare status: AttendanceExceptionStatus;

  @ForeignKey(() => Employee)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare approvedBy: number;

  @BelongsTo(() => Employee, { foreignKey: 'approvedBy', onDelete: 'SET NULL' })
  declare approver: Employee;

  @ForeignKey(() => Company)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare companyId: number | null;

  @BelongsTo(() => Company, { onDelete: 'CASCADE' })
  declare company: Company;

  @ForeignKey(() => AttendanceRecord)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare attendanceId: number | null;

  @BelongsTo(() => AttendanceRecord, { foreignKey: 'attendanceId', onDelete: 'SET NULL' })
  declare attendanceRecordRef: AttendanceRecord;

  @ForeignKey(() => LeaveRequest)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare leaveId: number | null;

  @BelongsTo(() => LeaveRequest, { onDelete: 'SET NULL' })
  declare leaveRequest: LeaveRequest;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare exceptionType: string | null;

  @AllowNull(true)
  @Column({ type: DataType.STRING(255) })
  declare resolution: string | null;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare resolvedBy: number | null;

  @BelongsTo(() => User, { foreignKey: 'resolvedBy', onDelete: 'SET NULL' })
  declare resolver: User;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare resolvedAt: Date | null;

  @Default('MEDIUM')
  @AllowNull(false)
  @Column({ type: DataType.STRING(20) })
  declare priority: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50), unique: true })
  declare conflictRef: string | null;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare remarks: string;

  @AllowNull(true)
  @Column({ type: DataType.JSON })
  declare metadata: any;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
