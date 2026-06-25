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
} from 'sequelize-typescript';
import { Employee } from '../../hrms/models/employee.model';
import { AttendanceRecord } from './attendance-record.model';

export enum AttendanceActionType {
  CHECK_IN = 'CHECK_IN',
  CHECK_OUT = 'CHECK_OUT',
  BREAK_START = 'BREAK_START',
  BREAK_END = 'BREAK_END',
  AUTO_CORRECTION = 'AUTO_CORRECTION',
  REGULARIZATION_APPROVED = 'REGULARIZATION_APPROVED',
  ADMIN_MARKED = 'ADMIN_MARKED',
}

@Table({
  tableName: 'attendance_logs',
  timestamps: false,
  indexes: [
    { fields: ['attendanceRecordId'] },
    { fields: ['employeeId'] },
    { fields: ['attendanceRecordId', 'actionType'] },
  ],
})
export class AttendanceLog extends Model<AttendanceLog> {
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

  @ForeignKey(() => AttendanceRecord)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare attendanceRecordId: number;

  @BelongsTo(() => AttendanceRecord)
  declare attendanceRecord: AttendanceRecord;

  @AllowNull(false)
  @Column({
    type: DataType.ENUM(
      'CHECK_IN',
      'CHECK_OUT',
      'BREAK_START',
      'BREAK_END',
      'AUTO_CORRECTION',
      'REGULARIZATION_APPROVED',
      'ADMIN_MARKED',
    ),
  })
  declare actionType: AttendanceActionType;

  @AllowNull(false)
  @Column({ type: DataType.DATE })
  declare timestamp: Date;

  @AllowNull(true)
  @Column({ type: DataType.JSON })
  declare metadata: any;

  @CreatedAt
  @Column({ type: DataType.DATE, defaultValue: DataType.NOW })
  declare createdAt: Date;
}
