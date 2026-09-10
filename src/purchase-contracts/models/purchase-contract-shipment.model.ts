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
import { PurchaseContractItem } from './purchase-contract-item.model';
import { SalesContractShipment } from '../../sales-contracts/models/sales-contract-shipment.model';

/**
 * Junction table for linking shipments to Purchase Contract & Item.
 * Stores allocatedQuantity for Partial Shipment Allocation.
 */
@Table({
  tableName: 'purchase_contract_shipments',
  timestamps: true,
  updatedAt: false,
  indexes: [
    { unique: true, fields: ['purchase_contract_id', 'shipment_id'] },
    { fields: ['shipment_id'] },
    { fields: ['purchase_contract_item_id'] },
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

  @ForeignKey(() => PurchaseContractItem)
  @AllowNull(true)
  @Column({ field: 'purchase_contract_item_id', type: DataType.INTEGER })
  declare purchaseContractItemId: number;

  @BelongsTo(() => PurchaseContractItem)
  declare purchaseContractItem: PurchaseContractItem;

  @ForeignKey(() => SalesContractShipment)
  @AllowNull(false)
  @Column({ field: 'shipment_id', type: DataType.INTEGER })
  declare shipmentId: number;

  @BelongsTo(() => SalesContractShipment)
  declare shipment: SalesContractShipment;

  @AllowNull(true)
  @Column({ field: 'allocated_quantity', type: DataType.DECIMAL(12, 2) })
  declare allocatedQuantity: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
