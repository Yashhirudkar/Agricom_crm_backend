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
import type { Quotation } from './quotation.model';
import { Product } from '../../masters/product/product.model';
import { BagSpecification } from '../../masters/bag-specs/models/bag-specification.model';
import { PackingType } from '../../masters/bag-specs/models/packing-type.model';

@Table({
  tableName: 'quotation_items',
  timestamps: true,
  indexes: [{ fields: ['quotation_id'] }, { fields: ['product_id'] }],
})
export class QuotationItem extends Model<QuotationItem> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  // ─── Parent quotation ─────────────────────────────────────────────────────

  @ForeignKey(() => require('./quotation.model').Quotation)
  @AllowNull(false)
  @Column({ field: 'quotation_id', type: DataType.INTEGER })
  declare quotationId: number;

  @BelongsTo(() => require('./quotation.model').Quotation)
  declare quotation: Quotation;

  // ─── Product ──────────────────────────────────────────────────────────────

  @ForeignKey(() => Product)
  @AllowNull(false)
  @Column({ field: 'product_id', type: DataType.INTEGER })
  declare productId: number;

  @BelongsTo(() => Product)
  declare product: Product;

  // ─── Product sub-fields ───────────────────────────────────────────────────

  /**
   * SubType / Specification — sourced from the product's qualitySubType
   * dropdown or entered manually when the product has no qualitySubType.
   */
  @AllowNull(true)
  @Column({ field: 'sub_type_spec', type: DataType.STRING(255) })
  declare subTypeSpec: string;

  /**
   * Selected BagSpecification (packaging).
   * When selected, packingTypeId is auto-derived from the spec's packingType.
   */
  @ForeignKey(() => BagSpecification)
  @AllowNull(true)
  @Column({ field: 'packaging_id', type: DataType.INTEGER })
  declare packagingId: number;

  @BelongsTo(() => BagSpecification, 'packagingId')
  declare bagSpecification: BagSpecification;

  /**
   * Auto-derived from BagSpecification.packingTypeId on the frontend.
   * Stored for immutable audit — if the master changes later, the quotation
   * still reflects what was in effect when the quotation was created.
   */
  @ForeignKey(() => PackingType)
  @AllowNull(true)
  @Column({ field: 'packing_type_id', type: DataType.INTEGER })
  declare packingTypeId: number;

  @BelongsTo(() => PackingType, 'packingTypeId')
  declare packingType: PackingType;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare purity: string;

  // ─── Pricing ──────────────────────────────────────────────────────────────

  @AllowNull(false)
  @Column({ field: 'offered_price', type: DataType.DECIMAL(15, 4) })
  declare offeredPrice: number;

  /**
   * Position for future multi-item quotation ordering.
   * Phase-1 always 0 (single item).
   */
  @Default(0)
  @AllowNull(false)
  @Column({ field: 'sort_order', type: DataType.INTEGER })
  declare sortOrder: number;

  // ─── Timestamps ───────────────────────────────────────────────────────────

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
