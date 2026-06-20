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
import { Employee } from '../../hrms/models/employee.model';
import { Shift } from './shift.model';
import { AttendanceLog } from './attendance-log.model';

export enum AttendanceState {
  NOT_CHECKED_IN = 'NOT_CHECKED_IN',
  WORKING = 'WORKING',
  ON_BREAK = 'ON_BREAK',
  CHECKED_OUT = 'CHECKED_OUT',
}

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  HALF_DAY = 'HALF_DAY',
  LATE = 'LATE',
  WEEK_OFF = 'WEEK_OFF',
  ON_LEAVE = 'ON_LEAVE',
  HOLIDAY = 'HOLIDAY',
  UPCOMING = 'UPCOMING',
}

export enum AttendanceSource {
  SELF_PUNCH = 'SELF_PUNCH',
  ADMIN_MARKED = 'ADMIN_MARKED',
  REGULARIZATION_APPROVED = 'REGULARIZATION_APPROVED',
  AUTO_BREAK_SYSTEM = 'AUTO_BREAK_SYSTEM',
  BIOMETRIC = 'BIOMETRIC',
  API_IMPORT = 'API_IMPORT',
}

@Table({
  tableName: 'attendance_records',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['employeeId', 'date'],
    },
  ],
})
export class AttendanceRecord extends Model<AttendanceRecord> {
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

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare companyId: number;

  @BelongsTo(() => Company)
  declare company: Company;

  @AllowNull(false)
  @Column({ type: DataType.DATEONLY })
  declare date: string;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare checkInTime: Date;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare checkOutTime: Date;

  @Default(0)
  @AllowNull(true)
  @Column({ type: DataType.DECIMAL(5, 2) })
  declare totalHours: number;

  @Default(0)
  @AllowNull(true)
  @Column({ type: DataType.DECIMAL(5, 2) })
  declare overtimeHours: number;

  @Default(0)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare lateMinutes: number;

  @Default(AttendanceState.NOT_CHECKED_IN)
  @AllowNull(false)
  @Column({
    type: DataType.ENUM('NOT_CHECKED_IN', 'WORKING', 'ON_BREAK', 'CHECKED_OUT'),
  })
  declare attendanceState: AttendanceState;

  @AllowNull(true)
  @Column({
    type: DataType.ENUM('PRESENT', 'ABSENT', 'HALF_DAY', 'LATE', 'WEEK_OFF', 'ON_LEAVE', 'HOLIDAY', 'UPCOMING'),
  })
  declare attendanceStatus: AttendanceStatus;

  @Default(AttendanceSource.SELF_PUNCH)
  @AllowNull(false)
  @Column({
    type: DataType.ENUM('SELF_PUNCH', 'ADMIN_MARKED', 'REGULARIZATION_APPROVED', 'AUTO_BREAK_SYSTEM', 'BIOMETRIC', 'API_IMPORT'),
  })
  declare attendanceSource: AttendanceSource;

  @AllowNull(true)
  @Column({ type: DataType.DECIMAL(10, 8) })
  declare locationLat: number;

  @AllowNull(true)
  @Column({ type: DataType.DECIMAL(11, 8) })
  declare locationLng: number;

  @ForeignKey(() => Shift)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare shiftId: number;

  @BelongsTo(() => Shift)
  declare shift: Shift;

  @HasMany(() => AttendanceLog)
  declare logs: AttendanceLog[];

  @Default(false)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare isPayrollLocked: boolean;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
