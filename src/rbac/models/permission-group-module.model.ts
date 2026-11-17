import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  Default,
} from 'sequelize-typescript';
import { PermissionGroup } from './permission-group.model';
import { AppModule as AppModuleModel } from '../../system/models/app-module.model';

@Table({
  tableName: 'permission_group_modules',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['group_id', 'module_id'],
    },
  ],
})
export class PermissionGroupModule extends Model<PermissionGroupModule> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @ForeignKey(() => PermissionGroup)
  @Column(DataType.INTEGER)
  declare group_id: number;

  @ForeignKey(() => AppModuleModel)
  @Column(DataType.INTEGER)
  declare module_id: number;

  @Default(0)
  @Column(DataType.INTEGER)
  declare sort_order: number;

  @BelongsTo(() => PermissionGroup, 'group_id')
  declare group: PermissionGroup;

  @BelongsTo(() => AppModuleModel, 'module_id')
  declare module: AppModuleModel;
}

