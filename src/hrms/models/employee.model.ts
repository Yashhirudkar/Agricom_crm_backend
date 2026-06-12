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
  Unique,
} from 'sequelize-typescript';
import { Company } from '../../companies/models/company.model';
import { Department } from '../../companies/models/department.model';
import { User } from '../../users/models/user.model';
import { Designation } from './designation.model';
import { EmployeeDocument } from './employee-document.model';

@Table({
  tableName: 'employees',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['companyId', 'employeeCode'],
    },
  ],
})
export class Employee extends Model<Employee> {
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

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare userId: number;

  @BelongsTo(() => User, 'userId')
  declare user: User;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare employeeCode: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare firstName: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare lastName: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare email: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(20) })
  declare mobile: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(20) })
  declare gender: string;

  @AllowNull(true)
  @Column({ type: DataType.DATEONLY })
  declare dob: Date;

  // Employment Info
  @ForeignKey(() => Department)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'RESTRICT' })
  declare departmentId: number;

  @BelongsTo(() => Department)
  declare department: Department;

  @ForeignKey(() => Designation)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'RESTRICT' })
  declare designationId: number;

  @BelongsTo(() => Designation)
  declare designation: Designation;



  @AllowNull(true)
  @Column({ type: DataType.DATEONLY })
  declare joiningDate: Date;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare employmentType: string; // Full-time, Part-time, Contract, Intern

  @Default('Active')
  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare status: string; // Active, Inactive, On Leave, Terminated

  // Emergency Contact
  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare emergencyContactName: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(20) })
  declare emergencyContactNumber: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare emergencyContactRelation: string;

  // Address
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

  // System
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

  @HasMany(() => EmployeeDocument)
  declare documents: EmployeeDocument[];
}
