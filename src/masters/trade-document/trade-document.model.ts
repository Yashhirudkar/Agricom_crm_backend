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
  tableName: 'trade_documents',
  timestamps: true,
  indexes: [{ fields: ['status'] }],
})
export class TradeDocument extends Model<TradeDocument> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @Unique
  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare code: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare name: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(500) })
  declare description: string;

  @Default(false)
  @AllowNull(false)
  @Column({ field: 'mandatory_by_default', type: DataType.BOOLEAN })
  declare mandatoryByDefault: boolean;

  @Default(0)
  @AllowNull(false)
  @Column({ field: 'sort_order', type: DataType.INTEGER })
  declare sortOrder: number;

  @Default('Active')
  @AllowNull(false)
  @Column({ type: DataType.STRING(20) })
  declare status: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(500) })
  declare remarks: string;

  @AllowNull(true)
  @Column({ field: 'created_by', type: DataType.INTEGER })
  declare createdBy: number;

  @AllowNull(true)
  @Column({ field: 'updated_by', type: DataType.INTEGER })
  declare updatedBy: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
