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
  UpdatedAt,
} from 'sequelize-typescript';
import { Product } from '../../product/product.model';
import { BagSpecification } from './bag-specification.model';

@Table({
  tableName: 'product_bag_assignments',
  timestamps: true,
  indexes: [
    { fields: ['product_id'] },
    { fields: ['bag_specification_id'] },
    { unique: true, fields: ['product_id', 'bag_specification_id'] },
  ],
})
export class ProductBagAssignment extends Model<ProductBagAssignment> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Product)
  @Column({ field: 'product_id', type: DataType.INTEGER })
  declare productId: number;

  @BelongsTo(() => Product)
  declare product: Product;

  @ForeignKey(() => BagSpecification)
  @Column({ field: 'bag_specification_id', type: DataType.INTEGER })
  declare bagSpecificationId: number;

  @BelongsTo(() => BagSpecification)
  declare bagSpecification: BagSpecification;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
