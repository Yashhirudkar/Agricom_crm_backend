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
  Default,
} from 'sequelize-typescript';
import { Employee } from './employee.model';
import { User } from '../../users/models/user.model';
import { Company } from '../../companies/models/company.model';

export enum DocumentCategory {
  IDENTITY = 'IDENTITY',
  EMPLOYMENT = 'EMPLOYMENT',
  EDUCATION = 'EDUCATION',
  FINANCIAL = 'FINANCIAL',
  OTHER = 'OTHER',
}

export enum VerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

@Table({
  tableName: 'employee_documents',
  timestamps: true,
})
export class EmployeeDocument extends Model<EmployeeDocument> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Employee)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare employeeId: number;

  @BelongsTo(() => Employee)
  declare employee: Employee;

  @ForeignKey(() => Company)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare companyId: number;

  @BelongsTo(() => Company)
  declare company: Company;

  @AllowNull(false)
  @Default(DocumentCategory.OTHER)
  @Column({
    type: DataType.ENUM(
      DocumentCategory.IDENTITY,
      DocumentCategory.EMPLOYMENT,
      DocumentCategory.EDUCATION,
      DocumentCategory.FINANCIAL,
      DocumentCategory.OTHER
    ),
  })
  declare documentCategory: DocumentCategory;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare documentType: string; // e.g. AADHAAR, PAN, OFFER_LETTER

  @AllowNull(true)
  @Column({ type: DataType.STRING(255) })
  declare documentName: string; // e.g. Aadhaar Card

  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare fileName: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(1000) })
  declare fileUrl: string; // legacy / download url

  @AllowNull(true)
  @Column({ type: DataType.STRING(1000) })
  declare filePath: string; // physical secure path

  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare fileSize: number;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare mimeType: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare documentNumber: string;

  @AllowNull(true)
  @Column({ type: DataType.DATEONLY })
  declare issueDate: Date;

  @AllowNull(true)
  @Column({ type: DataType.DATEONLY })
  declare expiryDate: Date;

  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare notifyBeforeExpiryDays: number;

  @AllowNull(false)
  @Default(VerificationStatus.PENDING)
  @Column({
    type: DataType.ENUM(
      VerificationStatus.PENDING,
      VerificationStatus.VERIFIED,
      VerificationStatus.REJECTED
    ),
  })
  declare verificationStatus: VerificationStatus;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare verificationRemarks: string;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare uploadedBy: number;

  @BelongsTo(() => User, 'uploadedBy')
  declare uploader: User;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare verifiedBy: number;

  @BelongsTo(() => User, 'verifiedBy')
  declare verifier: User;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare verifiedAt: Date;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare isMandatory: boolean;

  @AllowNull(false)
  @Default(1)
  @Column({ type: DataType.INTEGER })
  declare version: number;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare isActive: boolean;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
