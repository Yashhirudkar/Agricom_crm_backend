import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Unique,
  Default,
  HasMany,
  BelongsToMany,
} from 'sequelize-typescript';
import { PermissionGroupModule } from './permission-group-module.model';
import { AppModule as AppModuleModel } from '../../system/models/app-module.model';
import { Role } from './role.model';
import { RolePermissionGroup } from './role-permission-group.model';

@Table({
  tableName: 'permission_groups',
  timestamps: true,
})
export class PermissionGroup extends Model<PermissionGroup> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @AllowNull(false)
  @Unique
  @Column(DataType.STRING(100))
  declare name: string;

  @AllowNull(false)
  @Unique
  @Column(DataType.STRING(100))
  declare slug: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare description: string;

  @AllowNull(true)
  @Column(DataType.STRING(50))
  declare icon: string;

  @AllowNull(true)
  @Column(DataType.STRING(50))
  declare color: string;

  @Default(0)
  @Column(DataType.INTEGER)
  declare sort_order: number;

  @HasMany(() => PermissionGroupModule, 'group_id')
  declare groupModules: PermissionGroupModule[];

  @BelongsToMany(() => AppModuleModel, {
    through: () => PermissionGroupModule,
    foreignKey: 'group_id',
    otherKey: 'module_id',
  })
  declare modules: AppModuleModel[];

  @BelongsToMany(() => Role, {
    through: () => RolePermissionGroup,
    foreignKey: 'group_id',
    otherKey: 'role_id',
  })
  declare roles: Role[];
}
