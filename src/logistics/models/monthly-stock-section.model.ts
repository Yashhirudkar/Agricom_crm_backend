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
import { MonthlyStockSummary } from './monthly-stock-summary.model';
import { MonthlyStockSectionColumn } from './monthly-stock-section-column.model';
import { MonthlyStockSectionRow } from './monthly-stock-section-row.model';

@Table({
  tableName: 'monthly_stock_sections',
  timestamps: true,
  paranoid: true,
})
export class MonthlyStockSection extends Model<MonthlyStockSection> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => MonthlyStockSummary)
  @AllowNull(false)
  @Column({ field: 'monthly_stock_summary_id', type: DataType.INTEGER })
  declare monthlyStockSummaryId: number;

  @BelongsTo(() => MonthlyStockSummary, { onDelete: 'CASCADE' })
  declare summary: MonthlyStockSummary;

  @AllowNull(false)
  @Column({ field: 'section_name', type: DataType.STRING(255) })
  declare sectionName: string;

  @AllowNull(false)
  @Default(0)
  @Column({ field: 'display_order', type: DataType.INTEGER })
  declare displayOrder: number;

  @AllowNull(true)
  @Default(0)
  @Column({ field: 'layout_x', type: DataType.INTEGER })
  declare layoutX: number;

  @AllowNull(true)
  @Default(0)
  @Column({ field: 'layout_y', type: DataType.INTEGER })
  declare layoutY: number;

  @AllowNull(true)
  @Default(12)
  @Column({ field: 'layout_width', type: DataType.INTEGER })
  declare layoutWidth: number;

  @AllowNull(true)
  @Default(1)
  @Column({ field: 'layout_height', type: DataType.INTEGER })
  declare layoutHeight: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;

  @DeletedAt
  @Column({ field: 'deleted_at' })
  declare deletedAt: Date;

  @HasMany(() => MonthlyStockSectionColumn, { foreignKey: 'sectionId', onDelete: 'CASCADE' })
  declare columns: MonthlyStockSectionColumn[];

  @HasMany(() => MonthlyStockSectionRow, { foreignKey: 'sectionId', onDelete: 'CASCADE' })
  declare rows: MonthlyStockSectionRow[];
}
