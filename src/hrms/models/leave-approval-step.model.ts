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
import { LeaveRequest } from './leave-request.model';
import { Employee } from './employee.model';

export enum ApprovalStepStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  BYPASSED = 'BYPASSED',
}

@Table({
  tableName: 'leave_approval_steps',
  timestamps: true,
})
export class LeaveApprovalStep extends Model<LeaveApprovalStep> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => LeaveRequest)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare leaveRequestId: number;

  @BelongsTo(() => LeaveRequest)
  declare leaveRequest: LeaveRequest;

  @ForeignKey(() => Employee)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'RESTRICT' })
  declare approverId: number;

  @BelongsTo(() => Employee)
  declare approver: Employee;

  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare level: number;

  @AllowNull(false)
  @Column({
    type: DataType.ENUM('PENDING', 'APPROVED', 'REJECTED', 'BYPASSED'),
  })
  declare status: ApprovalStepStatus;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare remarks: string;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare approvedAt: Date;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
