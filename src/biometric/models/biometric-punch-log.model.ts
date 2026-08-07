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
  Default,
  CreatedAt,
  UpdatedAt,
  Index,
} from 'sequelize-typescript';
import { Company } from '../../companies/models/company.model';
import { AttendanceRecord } from '../../attendance/models/attendance-record.model';

export enum BiometricPunchStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  UNKNOWN_USER = 'UNKNOWN_USER',
  ERROR = 'ERROR',
}

@Table({
  tableName: 'biometric_punch_logs',
  timestamps: true,
  indexes: [
    {
      name: 'idx_biometric_punches_idemp',
      unique: true,
      fields: ['deviceSerialNumber', 'deviceLogId'],
    },
    {
      name: 'idx_biometric_punches_status',
      fields: ['status', 'companyId'],
    },
  ],
})
export class BiometricPunchLog extends Model<BiometricPunchLog> {
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

  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare deviceSerialNumber: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare deviceLogId: string; // The transaction index from the machine database (for idempotency)

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare biometricUserId: string;

  @AllowNull(false)
  @Column({ type: DataType.DATE })
  declare timestamp: Date; // Device time (machine local time)

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare serverReceivedTime: Date; // Server time when API controller received it

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare processedTime: Date; // Server time when successfully processed

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare punchType: string; // e.g. 'CHECK_IN', 'CHECK_OUT', or 'GENERIC'

  @Default(BiometricPunchStatus.PENDING)
  @AllowNull(false)
  @Column({
    type: DataType.ENUM('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'UNKNOWN_USER', 'ERROR'),
  })
  declare status: BiometricPunchStatus;

  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare retryCount: number;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare lastError: string;

  @ForeignKey(() => AttendanceRecord)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare processedRecordId: number;

  @BelongsTo(() => AttendanceRecord, { onDelete: 'SET NULL' })
  declare processedRecord: AttendanceRecord;

  @Default('NORMAL')
  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare priority: string; // HIGH, NORMAL, LOW

  @AllowNull(true)
  @Column({ type: DataType.STRING(255) })
  declare correlationId: string;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare nextRetryAt: Date;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare lastRetryAt: Date;

  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare rawPayload: any;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
