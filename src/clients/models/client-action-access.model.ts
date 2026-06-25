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
import { ResourceAction } from '../../system/models/resource-action.model';

@Table({
  tableName: 'client_action_access',
  timestamps: false,
})
export class ClientActionAccess extends Model<ClientActionAccess> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Client)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare client_id: number;

  @BelongsTo(() => Client)
  declare client: Client;

  @ForeignKey(() => ResourceAction)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare resource_action_id: number;

  @BelongsTo(() => ResourceAction)
  declare resourceAction: ResourceAction;

  @CreatedAt
  declare created_at: Date;
}
