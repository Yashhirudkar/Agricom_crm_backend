import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Default,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { User } from '../../users/models/user.model';

@Table({
  tableName: 'monthly_targets',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'month', 'year'],
      name: 'uq_monthly_targets_user_month_year',
    },
  ],
})
export class MonthlyTarget extends Model<MonthlyTarget> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column({ field: 'user_id', type: DataType.INTEGER })
  declare userId: number;

  @BelongsTo(() => User)
  declare user: User;

  @AllowNull(false)
  @Column({ field: 'month', type: DataType.INTEGER })
  declare month: number;

  @AllowNull(false)
  @Column({ field: 'year', type: DataType.INTEGER })
  declare year: number;

  @AllowNull(false)
  @Column({ field: 'target_mt', type: DataType.DECIMAL(12, 2) })
  declare targetMT: number;

  @Default(true)
  @AllowNull(false)
  @Column({ field: 'is_locked', type: DataType.BOOLEAN })
  declare isLocked: boolean;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}

