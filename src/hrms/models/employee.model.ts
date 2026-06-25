import {
  Index,
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
import { Designation } from './designation.model';
import { EmployeeDocument } from './employee-document.model';
import { Branch } from './branch.model';
import { EmployeeLifecycleLog } from './employee-lifecycle-log.model';
import { Shift } from '../../attendance/models/shift.model';

export enum EmployeeStatus {
  DRAFT = 'DRAFT',
  ONBOARDING = 'ONBOARDING',
  PROBATION = 'PROBATION',
  ACTIVE = 'ACTIVE',
  CONFIRMED = 'CONFIRMED',
  NOTICE_PERIOD = 'NOTICE_PERIOD',
  RESIGNED = 'RESIGNED',
  TERMINATED = 'TERMINATED',
}

export enum EmploymentType {
  FULL_TIME = 'FULL_TIME',
  PART_TIME = 'PART_TIME',
  INTERN = 'INTERN',
  CONTRACT = 'CONTRACT',
  CONSULTANT = 'CONSULTANT',
}

export enum WorkMode {
  REMOTE = 'REMOTE',
  HYBRID = 'HYBRID',
  OFFICE = 'OFFICE',
}

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
  @Index
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare companyId: number;

  @BelongsTo(() => Company)
  declare company: Company;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Index
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare userId: number;

  @BelongsTo(() => User, 'userId')
  declare user: User;

  // ─── Personal Information ─────────────────────────────────────────
  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare firstName: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare middleName: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare lastName: string;

  @AllowNull(true)
  @Column({ type: DataType.DATEONLY })
  declare dob: Date;

  @AllowNull(true)
  @Column({ type: DataType.STRING(20) })
  declare gender: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(10) })
  declare bloodGroup: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare maritalStatus: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare nationality: string;

  // ─── Contact Information ──────────────────────────────────────────
  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare email: string; // Work email

  @AllowNull(true)
  @Column({ type: DataType.STRING(255) })
  declare personalEmail: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(20) })
  declare mobile: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(20) })
  declare alternatePhone: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare emergencyContactName: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(20) })
  declare emergencyContactNumber: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare emergencyContactRelation: string;

  // ─── Address Information ──────────────────────────────────────────
  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare address: string; // Legacy field

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare currentAddress: string;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare permanentAddress: string;

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

  // ─── Employment Information ───────────────────────────────────────
  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare employeeCode: string;

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

  @ForeignKey(() => Branch)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'RESTRICT' })
  declare branchId: number;

  @BelongsTo(() => Branch, 'branchId')
  declare branch: Branch;

  @ForeignKey(() => Employee)
  @AllowNull(true)
  @Index
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare managerId: number;

  @BelongsTo(() => Employee, 'managerId')
  declare manager: Employee;

  @AllowNull(true)
  @Column({ type: DataType.DATEONLY })
  declare joiningDate: Date;

  @AllowNull(true)
  @Column({ type: DataType.DATEONLY })
  declare probationEndDate: Date;

  @AllowNull(true)
  @Column({ type: DataType.DATEONLY })
  declare confirmationDate: Date;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare workLocation: string;

  @AllowNull(true)
  @Column({
    type: DataType.ENUM('REMOTE', 'HYBRID', 'OFFICE'),
  })
  declare workMode: WorkMode;

  @AllowNull(false)
  @Column({
    type: DataType.ENUM(
      'FULL_TIME',
      'PART_TIME',
      'INTERN',
      'CONTRACT',
      'CONSULTANT',
    ),
  })
  declare employmentType: EmploymentType;

  @AllowNull(false)
  @Column({
    type: DataType.ENUM(
      'DRAFT',
      'ONBOARDING',
      'PROBATION',
      'ACTIVE',
      'CONFIRMED',
      'NOTICE_PERIOD',
      'RESIGNED',
      'TERMINATED',
    ),
  })
  declare status: EmployeeStatus;

  // ─── System ───────────────────────────────────────────────────────
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

  @ForeignKey(() => Shift)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare shiftId: number;

  @BelongsTo(() => Shift)
  declare shift: Shift;

  @HasMany(() => EmployeeDocument)
  declare documents: EmployeeDocument[];

  @HasMany(() => EmployeeLifecycleLog)
  declare lifecycleLogs: EmployeeLifecycleLog[];
}
