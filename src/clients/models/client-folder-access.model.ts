import {
  Index,
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  CreatedAt,
} from 'sequelize-typescript';
import { Client } from './client.model';
import { SidebarFolder } from '../../system/models/sidebar-folder.model';

@Table({
  tableName: 'client_folder_access',
  timestamps: false,
})
export class ClientFolderAccess extends Model<ClientFolderAccess> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Client)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare client_id: number;

  @BelongsTo(() => Client)
  declare client: Client;

  @ForeignKey(() => SidebarFolder)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare folder_id: number;

  @BelongsTo(() => SidebarFolder)
  declare folder: SidebarFolder;

  @CreatedAt
  declare created_at: Date;
}
