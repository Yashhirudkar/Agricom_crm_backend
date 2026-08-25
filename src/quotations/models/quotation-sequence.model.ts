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
  Unique,
} from 'sequelize-typescript';

@Table({
  tableName: 'quotation_sequences',
  timestamps: true,
  indexes: [{ unique: true, fields: ['period'] }],
})
export class QuotationSequence extends Model<QuotationSequence> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  /**
   * Calendar period in YYYYMM format (e.g. "202608").
   * One row per month; last_seq increments atomically via ON CONFLICT DO UPDATE.
   */
  @Unique
  @AllowNull(false)
  @Column({ type: DataType.STRING(6) })
  declare period: string;

  /**
   * Last sequence number issued in this period.
   * Starts at 0; incremented atomically on each quotation creation.
   */
  @Default(0)
  @AllowNull(false)
  @Column({ field: 'last_seq', type: DataType.INTEGER })
  declare lastSeq: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
