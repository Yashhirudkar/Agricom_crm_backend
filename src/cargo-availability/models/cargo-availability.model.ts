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
  HasMany,
} from 'sequelize-typescript';
import { PurchaseContract } from '../../purchase-contracts/models/purchase-contract.model';
import { PurchaseContractItem } from '../../purchase-contracts/models/purchase-contract-item.model';
import { Product } from '../../masters/product/product.model';
import { CargoReadiness } from './cargo-readiness.model';
import { CargoShipmentAllocation } from './cargo-shipment-allocation.model';
import { CargoLoading } from './cargo-loading.model';

@Table({
  tableName: 'cargo_availability',
  timestamps: true,
  indexes: [
    { fields: ['purchase_contract_id'] },
    { fields: ['purchase_contract_item_id'] },
    { fields: ['product_id'] },
  ],
})
export class CargoAvailability extends Model<CargoAvailability> {
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

  @ForeignKey(() => Product)
  @AllowNull(false)
  @Column({ field: 'product_id', type: DataType.INTEGER })
  declare productId: number;

  @BelongsTo(() => Product)
  declare product: Product;

  @Default(0)
  @AllowNull(false)
  @Column({ field: 'purchase_qty', type: DataType.DECIMAL(12, 2) })
  declare purchaseQty: number;

  @Default('Pending Readiness')
  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare status: string;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;

  // ─── Associations ─────────────────────────────────────────────────────────────
  @HasMany(() => CargoReadiness)
  declare readinessEntries: CargoReadiness[];

  @HasMany(() => CargoShipmentAllocation)
  declare shipmentAllocations: CargoShipmentAllocation[];

  @HasMany(() => CargoLoading)
  declare loadingEntries: CargoLoading[];
}
