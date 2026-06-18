import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  Default,
  AllowNull,
  HasMany,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { ModuleResource } from './module-resource.model';
import { ClientModuleAccess } from '../../clients/models/client-module-access.model';

@Table({
  tableName: 'app_modules',
  timestamps: true,
})
export class AppModule extends Model<AppModule> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare name: string; // e.g. Attendance, Payroll

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare icon_name: string;

  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare sort_order: number;

  @HasMany(() => ModuleResource)
  declare resources: ModuleResource[];

  @HasMany(() => ClientModuleAccess)
  declare clientAccess: ClientModuleAccess[];

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
