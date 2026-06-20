import { Table, Column, Model, DataType, ForeignKey, CreatedAt } from 'sequelize-typescript';
import { Partner } from './partner.model';
import { Product } from '../product/product.model';

@Table({
  tableName: 'partner_products',
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['partner_id'] },
    { fields: ['product_id'] },
    { unique: true, fields: ['partner_id', 'product_id'] }
  ]
})
export class PartnerProduct extends Model<PartnerProduct> {
  @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
  declare id: number;

  @ForeignKey(() => Partner)
  @Column({ field: 'partner_id', type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare partnerId: number;

  @ForeignKey(() => Product)
  @Column({ field: 'product_id', type: DataType.INTEGER })
  declare productId: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
