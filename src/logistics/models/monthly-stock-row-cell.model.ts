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
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';

@Table({
  tableName: 'monthly_stock_row_cells',
  timestamps: true,
})
export class MonthlyStockRowCell extends Model<MonthlyStockRowCell> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => require('./monthly-stock-section-row.model').MonthlyStockSectionRow)
  @AllowNull(false)
  @Column({ field: 'row_id', type: DataType.INTEGER })
  declare rowId: number;

  @BelongsTo(() => require('./monthly-stock-section-row.model').MonthlyStockSectionRow, { onDelete: 'CASCADE' })
  declare row: any;

  @ForeignKey(() => require('./monthly-stock-section-column.model').MonthlyStockSectionColumn)
  @AllowNull(false)
  @Column({ field: 'column_id', type: DataType.INTEGER })
  declare columnId: number;

  @BelongsTo(() => require('./monthly-stock-section-column.model').MonthlyStockSectionColumn, { onDelete: 'CASCADE' })
  declare column: any;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare value: string;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
