import {
  AllowNull,
  Column,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

@Table({
  tableName: 'business_transaction_counters',
  timestamps: false,
})
export class BusinessTransactionCounter extends Model<BusinessTransactionCounter> {
  @PrimaryKey
  @Default(1)
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @AllowNull(false)
  @Default(0)
  @Column({ field: 'last_value', type: DataType.BIGINT })
  declare lastValue: number;
}
