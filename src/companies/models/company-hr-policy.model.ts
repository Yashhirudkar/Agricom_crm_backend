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
import { Company } from './company.model';
import { User } from '../../users/models/user.model';

@Table({
  tableName: 'company_hr_policies',
  timestamps: true,
})
export class CompanyHrPolicy extends Model<CompanyHrPolicy> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE', unique: true })
  declare companyId: number;

  @BelongsTo(() => Company)
  declare company: Company;

  @Default(8)
  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(5, 2) })
  declare defaultWorkingHoursPerDay: number;

  @Default(5)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare defaultWeeklyWorkingDays: number;

  @Default(90)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare probationPeriodDays: number;

  @Default(30)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare defaultNoticePeriodDays: number;

  @Default(false)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare overtimeAllowed: boolean;

  @Default(1.0)
  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(5, 2) })
  declare overtimeMultiplier: number;

  @Default(15)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare lateComingGraceMinutes: number;

  @Default(240) // e.g. 4 hours
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare halfDayAfterMinutes: number;

  @Default([0, 6]) // Sunday(0), Saturday(6)
  @AllowNull(false)
  @Column({ type: DataType.JSON })
  declare weeklyOffDays: any;

  @Default(false)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare allowRemoteWork: boolean;

  // New fields for attendance dependencies
  @Default(8)
  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(5, 2) })
  declare minHoursForPresent: number;

  @Default(4)
  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(5, 2) })
  declare minHoursForHalfDay: number;

  @Default(true)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare allowAttendanceCorrection: boolean;

  @Default(3)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare maxCorrectionDays: number;

  @Default(60)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare retirementAge: number;

  @Default('09:00')
  @AllowNull(false)
  @Column({ type: DataType.STRING })
  declare defaultShiftStartTime: string;

  @Default('18:00')
  @AllowNull(false)
  @Column({ type: DataType.STRING })
  declare defaultShiftEndTime: string;

  @Default(false)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare allowBackdatedLeave: boolean;

  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare maxBackdatedDays: number;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare updatedBy: number;

  @BelongsTo(() => User, 'updatedBy')
  declare updater: User;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
