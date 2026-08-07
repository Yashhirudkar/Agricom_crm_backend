import {
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
  Index,
} from 'sequelize-typescript';
import { Company } from '../../companies/models/company.model';
import { Employee } from '../../hrms/models/employee.model';
import { AttendanceRecord } from './attendance-record.model';
import { User } from '../../users/models/user.model';

@Table({
  tableName: 'attendance_audit_trails',
  timestamps: true,
})
export class AttendanceAuditTrail extends Model<AttendanceAuditTrail> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => AttendanceRecord)
  @AllowNull(false)
  @Index
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare attendanceRecordId: number;

  @BelongsTo(() => AttendanceRecord, { onDelete: 'CASCADE' })
  declare attendanceRecord: AttendanceRecord;

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
  @Column({ type: DataType.STRING(100) })
  declare action: string; // 'BIOMETRIC_SYNC', 'MANUAL_OVERRIDE', 'AUTO_CHECKOUT'

  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare revisionNumber: number;

  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare originalValue: any;

  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare newValue: any;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare reason: string;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare changedBy: number; // User ID who initiated the change (null for system)

  @BelongsTo(() => User, { onDelete: 'SET NULL' })
  declare changer: User;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
