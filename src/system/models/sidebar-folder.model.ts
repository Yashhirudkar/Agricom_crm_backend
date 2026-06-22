import { Index, Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  Default,
  AllowNull,
  HasMany,
  CreatedAt,
  UpdatedAt, } from 'sequelize-typescript';
import { SidebarItem } from './sidebar-item.model';
import { ClientFolderAccess } from '../../clients/models/client-folder-access.model';

@Table({
  tableName: 'sidebar_folders',
  timestamps: true,
})
export class SidebarFolder extends Model<SidebarFolder> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare name: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare icon_name: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50), field: 'icon_color' })
  declare iconColor: string;

  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare sort_order: number;

  @Default(true)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare is_active: boolean;

  @Default(false)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN, field: 'is_collapsible' })
  declare isCollapsible: boolean;

  @HasMany(() => SidebarItem)
  declare items: SidebarItem[];

  @HasMany(() => ClientFolderAccess)
  declare clientAccess: ClientFolderAccess[];

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
