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
  DeletedAt,
  ForeignKey,
  BelongsTo,
  HasMany,
} from 'sequelize-typescript';
import { MonthlyStockRowCell } from './monthly-stock-row-cell.model';

@Table({
  tableName: 'monthly_stock_section_rows',
  timestamps: true,
  paranoid: true,
})
export class MonthlyStockSectionRow extends Model<MonthlyStockSectionRow> {
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
  @Default(0)
  @Column({ field: 'row_order', type: DataType.INTEGER })
  declare rowOrder: number;

  @AllowNull(false)
  @Default(false)
  @Column({ field: 'is_total_row', type: DataType.BOOLEAN })
  declare isTotalRow: boolean;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;

  @DeletedAt
  @Column({ field: 'deleted_at' })
  declare deletedAt: Date;

  @HasMany(() => MonthlyStockRowCell, { foreignKey: 'rowId', onDelete: 'CASCADE' })
  declare cells: MonthlyStockRowCell[];
}
