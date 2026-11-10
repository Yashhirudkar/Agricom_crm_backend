import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';

@Table({
  tableName: 'exchange_rates',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['base_currency', 'target_currency', 'effective_date'],
      name: 'uq_exchange_rates_pair_date',
    },
  ],
})
export class ExchangeRate extends Model<ExchangeRate> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @AllowNull(false)
  @Column({ field: 'base_currency', type: DataType.STRING(3) })
  declare baseCurrency: string;

  @AllowNull(false)
  @Column({ field: 'target_currency', type: DataType.STRING(3) })
  declare targetCurrency: string;

  @AllowNull(false)
  @Column({ field: 'exchange_rate', type: DataType.DECIMAL(20, 10) })
  declare exchangeRate: number;

  @AllowNull(false)
  @Column({ field: 'effective_date', type: DataType.DATEONLY })
  declare effectiveDate: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare source: string;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
