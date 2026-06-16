import {
  Table,
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
  Default,
} from 'sequelize-typescript';
import { Company } from '../../companies/models/company.model';
import { Department } from '../../companies/models/department.model';
import { User } from '../../users/models/user.model';
import { Employee } from './employee.model';

@Table({
  tableName: 'designations',
  timestamps: true,
})
export class Designation extends Model<Designation> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare companyId: number;

  @BelongsTo(() => Company)
  declare company: Company;

  @ForeignKey(() => Department)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'RESTRICT' })
  declare departmentId: number;

  @BelongsTo(() => Department)
  declare department: Department;

  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare name: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare designationCode: string;

  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare level: number;

  @ForeignKey(() => Designation)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'RESTRICT' })
  declare parentDesignationId: number;

  @BelongsTo(() => Designation, 'parentDesignationId')
  declare parentDesignation: Designation;

  @HasMany(() => Designation, 'parentDesignationId')
  declare subDesignations: Designation[];

  @AllowNull(true)
  @Column({ type: DataType.DECIMAL(10, 2) })
  declare salaryBandMin: number;

  @AllowNull(true)
  @Column({ type: DataType.DECIMAL(10, 2) })
  declare salaryBandMax: number;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare description: string;

  @Default('Active')
  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare status: string; // 'Active' or 'Inactive'

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

  @HasMany(() => Employee)
  declare employees: Employee[];
}
