import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { Role } from './role.model';
import { PermissionGroup } from './permission-group.model';

@Table({
  tableName: 'role_permission_groups',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['role_id', 'group_id'],
    },
  ],
})
export class RolePermissionGroup extends Model<RolePermissionGroup> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @ForeignKey(() => Role)
  @Column(DataType.INTEGER)
  declare role_id: number;

  @ForeignKey(() => PermissionGroup)
  @Column(DataType.INTEGER)
  declare group_id: number;

  @BelongsTo(() => Role, 'role_id')
  declare role: Role;

  @BelongsTo(() => PermissionGroup, 'group_id')
  declare group: PermissionGroup;
}

