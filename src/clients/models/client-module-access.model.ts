import { Index, Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  CreatedAt, } from 'sequelize-typescript';
import { Client } from './client.model';
import { AppModule } from '../../system/models/app-module.model';

@Table({
  tableName: 'client_module_access',
  timestamps: false,
})
export class ClientModuleAccess extends Model<ClientModuleAccess> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Client)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare client_id: number;

  @BelongsTo(() => Client)
  declare client: Client;

  @ForeignKey(() => AppModule)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare module_id: number;

  @BelongsTo(() => AppModule)
  declare appModule: AppModule;

  @CreatedAt
  declare created_at: Date;
}
