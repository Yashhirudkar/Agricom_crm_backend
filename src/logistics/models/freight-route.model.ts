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
import { FreightRate } from './freight-rate.model';

@Table({
  tableName: 'freight_routes',
  timestamps: true,
  paranoid: true,
})
export class FreightRoute extends Model<FreightRoute> {
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
  @Column({ type: DataType.STRING(255) })
  declare origin: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare destination: string;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;

  @DeletedAt
  @Column({ field: 'deleted_at' })
  declare deletedAt: Date;

  @HasMany(() => FreightRate, 'routeId')
  declare rates: FreightRate[];
}
