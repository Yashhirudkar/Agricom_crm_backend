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
import { Product } from '../../masters/product/product.model';
import { BagType } from '../../masters/bag-specs/models/bag-type.model';
import { PackingType } from '../../masters/bag-specs/models/packing-type.model';
import { BagSpecification } from '../../masters/bag-specs/models/bag-specification.model';

@Table({
  tableName: 'sales_contract_items',
  timestamps: true,
})
export class SalesContractItem extends Model<SalesContractItem> {
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

  @ForeignKey(() => Product)
  @AllowNull(false)
  @Column({ field: 'product_id', type: DataType.INTEGER })
  declare productId: number;

  @BelongsTo(() => Product)
  declare product: Product;

  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(12, 2) })
  declare quantity: number;

  @Default(0)
  @AllowNull(false)
  @Column({ field: 'unit_price', type: DataType.DECIMAL(12, 2) })
  declare unitPrice: number;

  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(15, 2) })
  declare amount: number;

  @ForeignKey(() => BagType)
  @AllowNull(false)
  @Column({ field: 'bag_type_id', type: DataType.INTEGER })
  declare bagTypeId: number;

  @BelongsTo(() => BagType)
  declare bagType: BagType;

  @ForeignKey(() => PackingType)
  @AllowNull(false)
  @Column({ field: 'packing_type_id', type: DataType.INTEGER })
  declare packingTypeId: number;

  @BelongsTo(() => PackingType)
  declare packingType: PackingType;

  @ForeignKey(() => BagSpecification)
  @AllowNull(true)
  @Column({ field: 'bag_specification_id', type: DataType.INTEGER })
  declare bagSpecificationId: number;

  @BelongsTo(() => BagSpecification)
  declare bagSpecification: BagSpecification;

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
