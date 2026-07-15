import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Default,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { SalesContract } from './sales-contract.model';

@Table({
  tableName: 'sales_contract_shipments',
  timestamps: true,
})
export class SalesContractShipment extends Model<SalesContractShipment> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => SalesContract)
  @AllowNull(false)
  @Column({ field: 'sales_contract_id', type: DataType.INTEGER })
  declare salesContractId: number;

  @BelongsTo(() => SalesContract)
  declare salesContract: SalesContract;

  @AllowNull(false)
  @Column({ field: 'shipment_date', type: DataType.DATEONLY })
  declare shipmentDate: Date;

  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(12, 2) })
  declare quantity: number;

  @AllowNull(true)
  @Column({ type: DataType.STRING(500) })
  declare remarks: string;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
