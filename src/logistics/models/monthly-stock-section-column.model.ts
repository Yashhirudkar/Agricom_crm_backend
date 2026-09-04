import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Default,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';

@Table({
  tableName: 'monthly_stock_section_columns',
  timestamps: true,
})
export class MonthlyStockSectionColumn extends Model<MonthlyStockSectionColumn> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => require('./monthly-stock-section.model').MonthlyStockSection)
  @AllowNull(false)
  @Column({ field: 'section_id', type: DataType.INTEGER })
  declare sectionId: number;

  @BelongsTo(() => require('./monthly-stock-section.model').MonthlyStockSection, { onDelete: 'CASCADE' })
  declare section: any;

  @AllowNull(false)
  @Column({ field: 'column_name', type: DataType.STRING(255) })
  declare columnName: string;

  @AllowNull(false)
  @Column({ field: 'column_key', type: DataType.STRING(100) })
  declare columnKey: string;

  @AllowNull(false)
  @Default(0)
  @Column({ field: 'display_order', type: DataType.INTEGER })
  declare displayOrder: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
