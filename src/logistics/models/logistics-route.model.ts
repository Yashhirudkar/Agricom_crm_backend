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
} from 'sequelize-typescript';
import { Logistics } from './logistics.model';
import { FreightQuote } from './freight-quote.model';

@Table({
  tableName: 'logistics_routes',
  timestamps: true,
})
export class LogisticsRoute extends Model<LogisticsRoute> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Logistics)
  @AllowNull(false)
  @Column({ field: 'logistics_id', type: DataType.INTEGER })
  declare logisticsId: number;

  @BelongsTo(() => Logistics)
  declare logistics: Logistics;

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

  @HasMany(() => FreightQuote, 'routeId')
  declare quotes: FreightQuote[];
}
