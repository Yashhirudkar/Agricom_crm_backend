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
import { Employee } from '../../hrms/models/employee.model';
import { AttendanceRecord } from './attendance-record.model';

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

  @BelongsTo(() => Employee, 'employeeId')
  declare employee: Employee;

  @ForeignKey(() => AttendanceRecord)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare attendanceRecordId: number;

  @BelongsTo(() => AttendanceRecord)
  declare attendanceRecord: AttendanceRecord;

  @AllowNull(false)
  @Column({
    type: DataType.ENUM('MISSED_PUNCH', 'MANUAL_ENTRY', 'REGULARIZATION', 'OVERRIDE'),
  })
  declare type: AttendanceExceptionType;

  @AllowNull(false)
  @Column({ type: DataType.TEXT })
  declare reason: string;

  @Default(AttendanceExceptionStatus.PENDING)
  @AllowNull(false)
  @Column({
    type: DataType.ENUM('PENDING', 'APPROVED', 'REJECTED'),
  })
  declare status: AttendanceExceptionStatus;

  @ForeignKey(() => Employee)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare approvedBy: number;

  @BelongsTo(() => Employee, 'approvedBy')
  declare approver: Employee;

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
