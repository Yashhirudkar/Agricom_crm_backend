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
  Index,
} from 'sequelize-typescript';
import { LeaveRequest } from './leave-request.model';
import { User } from '../../users/models/user.model';

@Table({
  tableName: 'leave_request_handover_users',
  timestamps: true,
  indexes: [
    { fields: ['leaveRequestId', 'userId'], unique: true },
    { fields: ['userId'] },
  ],
})
export class LeaveRequestHandoverUser extends Model<LeaveRequestHandoverUser> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => LeaveRequest)
  @AllowNull(false)
  @Index
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare leaveRequestId: number;

  @BelongsTo(() => LeaveRequest, { onDelete: 'CASCADE' })
  declare leaveRequest: LeaveRequest;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare userId: number;

  @BelongsTo(() => User, {
    foreignKey: 'userId',
    as: 'user',
    onDelete: 'CASCADE',
  })
  declare user: User;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare assignedBy: number | null;

  @BelongsTo(() => User, {
    foreignKey: 'assignedBy',
    as: 'assignedByUser',
    onDelete: 'SET NULL',
  })
  declare assignedByUser?: User;

  @AllowNull(false)
  @Column({ type: DataType.DATE, defaultValue: DataType.NOW })
  declare assignedAt: Date;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
