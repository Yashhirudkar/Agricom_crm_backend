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
  HasMany,
  CreatedAt,
  UpdatedAt,
  DeletedAt,
} from 'sequelize-typescript';
import { FreightQuote } from './freight-quote.model';
import { FreightQuoteCharge } from './freight-quote-charge.model';

@Table({
  tableName: 'freight_quote_container_rates',
  timestamps: true,
  paranoid: true,
})
export class FreightQuoteContainerRate extends Model<FreightQuoteContainerRate> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => FreightQuote)
  @AllowNull(false)
  @Column({ field: 'quote_id', type: DataType.INTEGER })
  declare quoteId: number;

  @BelongsTo(() => FreightQuote)
  declare quote: FreightQuote;

  @AllowNull(false)
  @Column({ field: 'container_type', type: DataType.STRING(50) })
  declare containerType: string;

  @AllowNull(false)
  @Column({ field: 'container_size', type: DataType.STRING(50) })
  declare containerSize: string;

  // Rate total amount (sum of all related charges)
  @AllowNull(false)
  @Column({
    field: 'freight_amount',
    type: DataType.DECIMAL(15, 4),
    defaultValue: 0,
  })
  declare freightAmount: number;

  @HasMany(() => FreightQuoteCharge, 'containerRateId')
  declare charges: FreightQuoteCharge[];

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;

  @DeletedAt
  @Column({ field: 'deleted_at' })
  declare deletedAt: Date;
}
