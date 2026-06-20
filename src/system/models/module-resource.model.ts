import { Index, Table,
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
  UpdatedAt, } from 'sequelize-typescript';
import { AppModule } from './app-module.model';
import { ResourceAction } from './resource-action.model';

@Table({
  tableName: 'module_resources',
  timestamps: true,
})
export class ModuleResource extends Model<ModuleResource> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare name: string; // e.g. employees, attendance_shifts

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare display_name: string;

  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare sort_order: number;

  @ForeignKey(() => AppModule)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare module_id: number;

  @BelongsTo(() => AppModule)
  declare appModule: AppModule;

  @HasMany(() => ResourceAction)
  declare actions: ResourceAction[];

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
