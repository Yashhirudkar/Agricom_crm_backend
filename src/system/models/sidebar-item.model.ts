import {
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
import { SidebarFolder } from './sidebar-folder.model';
import { ClientItemAccess } from '../../clients/models/client-item-access.model';

@Table({
  tableName: 'sidebar_items',
  timestamps: true,
})
export class SidebarItem extends Model<SidebarItem> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare name: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(255) })
  declare route: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare icon_name: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare permission_link: string; // e.g., employees:read

  @ForeignKey(() => SidebarFolder)
  @AllowNull(true) // null if item is at the root level without a folder
  @Column({ type: DataType.INTEGER })
  declare folder_id: number;

  @BelongsTo(() => SidebarFolder)
  declare folder: SidebarFolder;

  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare sort_order: number;

  @Default(true)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare is_active: boolean;

  @HasMany(() => ClientItemAccess)
  declare clientAccess: ClientItemAccess[];

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
