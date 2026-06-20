import { Index, Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  CreatedAt,
  UpdatedAt,
  Default, } from 'sequelize-typescript';
import { Company } from '../../companies/models/company.model';
import { User } from '../../users/models/user.model';
import { Employee } from './employee.model';

@Table({
  tableName: 'branches',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['companyId', 'branchCode'],
    },
    {
      unique: true,
      fields: ['companyId', 'branchName'],
    },
  ],
})
export class Branch extends Model<Branch> {
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

  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare branchName: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare branchCode: string;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare address: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare city: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare state: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare country: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(20) })
  declare pincode: string;

  @Default('UTC')
  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare timezone: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare contactNumber: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(255) })
  declare email: string;

  @ForeignKey(() => Employee)
  @AllowNull(true)
  @Index
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare managerId: number;

  @BelongsTo(() => Employee, 'managerId')
  declare manager: Employee;

  @Default(false)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare isHeadOffice: boolean;

  @Default(true)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare isActive: boolean;

  @AllowNull(true)
  @Column({ type: DataType.DOUBLE })
  declare latitude: number;

  @AllowNull(true)
  @Column({ type: DataType.DOUBLE })
  declare longitude: number;

  @AllowNull(true)
  @Column({ type: DataType.DOUBLE })
  declare geoFenceRadius: number;

  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare workingDays: string[];

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare holidayCalendarCode: string;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare createdBy: number;

  @BelongsTo(() => User, 'createdBy')
  declare creator: User;

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

  @HasMany(() => Employee, 'branchId')
  declare employees: Employee[];
}
