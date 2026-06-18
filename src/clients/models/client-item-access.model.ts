import {
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
import { SidebarItem } from '../../system/models/sidebar-item.model';

@Table({
  tableName: 'client_item_access',
  timestamps: false,
})
export class ClientItemAccess extends Model<ClientItemAccess> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Client)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare client_id: number;

  @BelongsTo(() => Client)
  declare client: Client;

  @ForeignKey(() => SidebarItem)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare item_id: number;

  @BelongsTo(() => SidebarItem)
  declare item: SidebarItem;

  @CreatedAt
  declare created_at: Date;
}
