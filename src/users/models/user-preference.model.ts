import { Index, Table, Column, Model, DataType, ForeignKey, BelongsTo, PrimaryKey, AutoIncrement, Default, CreatedAt, UpdatedAt } from 'sequelize-typescript';
import { User } from './user.model';

@Table({
  tableName: 'user_preferences',
  timestamps: true,
})
export class UserPreference extends Model<UserPreference> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @Index
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false, unique: true })
  declare userId: number;

  @BelongsTo(() => User)
  declare user: User;

  @Default(false)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare twoFactorEnabled: boolean;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare emailNotifications: boolean;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare pushNotifications: boolean;

  @Default('system')
  @Column({ type: DataType.STRING(50), allowNull: false })
  declare theme: string;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
