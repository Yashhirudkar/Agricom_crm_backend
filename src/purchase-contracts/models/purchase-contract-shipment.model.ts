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
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { PurchaseContract } from './purchase-contract.model';
import { SalesContractShipment } from '../../sales-contracts/models/sales-contract-shipment.model';

/**
 * Pure junction table.
 * No data duplication — all shipment data is read live from SalesContractShipment via joins.
 * The unique index (purchase_contract_id, shipment_id) prevents duplicate links at DB level.
 */
@Table({
  tableName: 'purchase_contract_shipments',
  timestamps: true,
  updatedAt: false,
  indexes: [
    { unique: true, fields: ['purchase_contract_id', 'shipment_id'] },
    { fields: ['shipment_id'] },
  ],
})
export class PurchaseContractShipment extends Model<PurchaseContractShipment> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => PurchaseContract)
  @AllowNull(false)
  @Column({ field: 'purchase_contract_id', type: DataType.INTEGER })
  declare purchaseContractId: number;

  @BelongsTo(() => PurchaseContract)
  declare purchaseContract: PurchaseContract;

  @ForeignKey(() => SalesContractShipment)
  @AllowNull(false)
  @Column({ field: 'shipment_id', type: DataType.INTEGER })
  declare shipmentId: number;

  @BelongsTo(() => SalesContractShipment)
  declare shipment: SalesContractShipment;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
