import {
  Table,
  Column,
  Model,
  DataType,
  Unique,
  AllowNull,
  BelongsToMany,
  HasMany,
  PrimaryKey,
  AutoIncrement,
  Default,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { Role } from './role.model';
import { RolePermission } from './role-permission.model';

@Table({
  tableName: 'permissions',
  timestamps: true,
})
export class Permission extends Model<Permission> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @Unique
  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare name: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare description: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare resource: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare action: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare module: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare label: string;

  @Default(true)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare isActive: boolean;

  @Default(false)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare isSystemLevel: boolean;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsToMany(() => Role, () => RolePermission)
  declare roles: Role[];

  @HasMany(() => RolePermission)
  declare rolePermissions: RolePermission[];
}
