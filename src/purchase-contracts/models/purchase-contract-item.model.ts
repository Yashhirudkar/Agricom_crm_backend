import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  HasMany,
} from 'sequelize-typescript';
import { PurchaseContract } from './purchase-contract.model';
import { Product } from '../../masters/product/product.model';
import { PurchaseContractShipment } from './purchase-contract-shipment.model';

@Table({
  tableName: 'purchase_contract_items',
  timestamps: true,
  indexes: [
    { fields: ['purchase_contract_id'] },
    { fields: ['product_id'] },
  ],
})
export class PurchaseContractItem extends Model<PurchaseContractItem> {
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

  @ForeignKey(() => Product)
  @AllowNull(true)
  @Column({ field: 'product_id', type: DataType.INTEGER })
  declare productId: number;

  @BelongsTo(() => Product)
  declare product: Product;

  @AllowNull(true)
  @Column({ field: 'product_name', type: DataType.STRING(255) })
  declare productName: string;

  @AllowNull(true)
  @Column({ type: DataType.DECIMAL(12, 2) })
  declare quantity: number;

  @AllowNull(true)
  @Column({ field: 'product_quality', type: DataType.STRING(255) })
  declare productQuality: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare packing: string;

  @AllowNull(true)
  @Column({ field: 'bag_type', type: DataType.STRING(100) })
  declare bagType: string;

  @AllowNull(true)
  @Column({ field: 'bag_spec', type: DataType.STRING(100) })
  declare bagSpec: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare stitching: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare marking: string;

  @AllowNull(true)
  @Column({ field: 'rate_per_mt', type: DataType.DECIMAL(12, 2) })
  declare ratePerMt: number;

  @AllowNull(true)
  @Column({ field: 'total_amount', type: DataType.DECIMAL(14, 2) })
  declare totalAmount: number;

  @HasMany(() => PurchaseContractShipment)
  declare shipmentLinks: PurchaseContractShipment[];

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
