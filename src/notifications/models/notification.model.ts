import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  PrimaryKey,
  AutoIncrement,
  Default,
  AllowNull,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { User } from '../../users/models/user.model';

@Table({
  tableName: 'notifications',
  timestamps: true,
})
export class Notification extends Model<Notification> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare userId: number;

  @BelongsTo(() => User)
  declare user: User;

  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare title: string;

  @AllowNull(false)
  @Column({ type: DataType.TEXT })
  declare message: string;

  @Default('INFO')
  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare type: string; // 'INFO', 'SUCCESS', 'WARNING', 'ERROR'

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare entityType: string; // 'Lead', 'Task', 'User', etc.

  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare entityId: number;

  @Default(false)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare isRead: boolean;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
