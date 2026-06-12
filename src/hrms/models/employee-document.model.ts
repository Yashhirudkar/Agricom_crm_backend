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
} from 'sequelize-typescript';
import { Employee } from './employee.model';
import { User } from '../../users/models/user.model';

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

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare documentType: string; // Profile Photo, Aadhaar, PAN, Resume, Offer Letter, Other

  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare fileName: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(1000) })
  declare fileUrl: string;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare uploadedBy: number;

  @BelongsTo(() => User, 'uploadedBy')
  declare uploader: User;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
