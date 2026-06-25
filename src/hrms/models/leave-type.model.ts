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
import { Company } from '../../companies/models/company.model';
import { User } from '../../users/models/user.model';

@Table({
  tableName: 'leave_types',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['companyId', 'code'],
    },
  ],
})
export class LeaveType extends Model<LeaveType> {
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
  @Column({ type: DataType.STRING(100) })
  declare name: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare code: string;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare description: string;

  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(5, 2) })
  declare daysPerYear: number;

  // Added based on user feedback
  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare minimumServiceDays: number;

  @Default(false)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare applicableAfterProbation: boolean;

  @Default(false)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare encashable: boolean;

  @Default(false)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare carryForwardAllowed: boolean;

  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(5, 2) })
  declare maxCarryForwardDays: number;

  @Default(true)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare requiresApproval: boolean;

  @Default(false)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare isPaid: boolean;

  @Default(false)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare allowHalfDay: boolean;

  @AllowNull(true)
  @Column({
    type: DataType.ENUM('MALE', 'FEMALE'),
  })
  declare genderRestriction: string;

  @AllowNull(true)
  @Column({
    type: DataType.ENUM('MARRIED', 'UNMARRIED'),
  })
  declare maritalRestriction: string;

  @Default(true)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare isActive: boolean;

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
}
