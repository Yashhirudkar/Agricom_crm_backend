import {
  Index,
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  ForeignKey,
  BelongsTo,
  CreatedAt,
} from 'sequelize-typescript';
import { User } from '../../users/models/user.model';

@Table({
  tableName: 'system_audit_logs',
  timestamps: false, // We only need created_at
})
export class SystemAuditLog extends Model<SystemAuditLog> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => User)
  @AllowNull(true) // Can be null if system-generated
  @Column({ type: DataType.INTEGER })
  declare user_id: number;

  @BelongsTo(() => User)
  declare user: User;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare action: string; // e.g. SIDEBAR_FOLDER_CREATE

  @AllowNull(true)
  @Column({ type: DataType.JSON })
  declare payload: any; // JSON containing details

  @CreatedAt
  declare created_at: Date;
}
