import { Index, Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  CreatedAt,
  UpdatedAt, } from 'sequelize-typescript';
import { LeaveRequest } from './leave-request.model';
import { User } from '../../users/models/user.model';

export enum LeaveAction {
  CREATED = 'CREATED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  ESCALATED = 'ESCALATED',
}

@Table({
  tableName: 'leave_approval_logs',
  timestamps: true,
})
export class LeaveApprovalLog extends Model<LeaveApprovalLog> {
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

  @AllowNull(false)
  @Column({
    type: DataType.ENUM('CREATED', 'APPROVED', 'REJECTED', 'CANCELLED', 'ESCALATED'),
  })
  declare action: LeaveAction;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare performedBy: number;

  @BelongsTo(() => User)
  declare performer: User;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare remarks: string;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
