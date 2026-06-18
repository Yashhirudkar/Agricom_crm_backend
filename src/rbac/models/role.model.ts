import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  HasMany,
  BelongsToMany,
  PrimaryKey,
  AutoIncrement,
  Default,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';

import { UserRole } from './user-role.model';
import { User } from '../../users/models/user.model';
import { Client } from '../../clients/models/client.model';
import { RoleActionPermission } from './role-action-permission.model';

@Table({
  tableName: 'roles',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['name', 'clientId'], // A role name should be unique per client. System roles (null clientId) are globally unique.
    }
  ]
})
export class Role extends Model<Role> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare name: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare description: string;

  @Default(true)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare isActive: boolean;

  @ForeignKey(() => Client)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare clientId: number;

  @BelongsTo(() => Client)
  declare client: Client;

  @Default(false)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare isSystemRole: boolean;

  // Legacy companyId column kept for DB sync compatibility
  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare companyId: number;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;



  @BelongsToMany(() => User, () => UserRole)
  declare users: User[];

  @HasMany(() => RoleActionPermission)
  declare roleActionPermissions: RoleActionPermission[];
}
