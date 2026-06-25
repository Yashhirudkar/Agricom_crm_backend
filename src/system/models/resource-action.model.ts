import {
  Index,
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  Default,
  AllowNull,
  ForeignKey,
  BelongsTo,
  HasMany,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { ModuleResource } from './module-resource.model';
import { RoleActionPermission } from '../../rbac/models/role-action-permission.model';
import { ClientActionAccess } from '../../clients/models/client-action-access.model';

@Table({
  tableName: 'resource_actions',
  timestamps: true,
})
export class ResourceAction extends Model<ResourceAction> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare name: string; // e.g. CREATE, READ, UPDATE, DELETE, ASSIGN_SHIFT

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare display_name: string;

  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare sort_order: number;

  @ForeignKey(() => ModuleResource)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare resource_id: number;

  @BelongsTo(() => ModuleResource)
  declare resource: ModuleResource;

  @HasMany(() => RoleActionPermission)
  declare rolePermissions: RoleActionPermission[];

  @HasMany(() => ClientActionAccess)
  declare clientAccess: ClientActionAccess[];

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
