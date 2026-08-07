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
import { Branch } from '../../hrms/models/branch.model';

export enum BiometricDeviceStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  SYNCING = 'SYNCING',
  ERROR = 'ERROR',
}

@Table({
  tableName: 'biometric_devices',
  timestamps: true,
})
export class BiometricDevice extends Model<BiometricDevice> {
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

  @ForeignKey(() => Branch)
  @AllowNull(true)
  @Index
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare branchId: number;

  @BelongsTo(() => Branch, { onDelete: 'SET NULL' })
  declare branch: Branch;

  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare name: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare ipAddress: string;

  @Default(4370)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare port: number;

  @Index({ unique: true })
  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare serialNumber: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(512) })
  declare secretKey: string;

  @Default(BiometricDeviceStatus.OFFLINE)
  @AllowNull(false)
  @Column({
    type: DataType.ENUM('ONLINE', 'OFFLINE', 'SYNCING', 'ERROR'),
  })
  declare status: BiometricDeviceStatus;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare lastHeartbeat: Date;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare lastSyncTime: Date;

  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare lastLogId: number;

  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare timeOffset: number; // in minutes (negative or positive)

  @Default(true)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare isActive: boolean;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare deletedAt: Date;

  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare deletedBy: number;

  @Default(1)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare configVersion: number;

  @Default(false)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare maintenanceMode: boolean;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
