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
import { Company } from '../../companies/models/company.model';
import type { MonthlyStockSummary } from './monthly-stock-summary.model';

@Table({
  tableName: 'monthly_stock_summary_countries',
  timestamps: true,
})
export class MonthlyStockSummaryCountry extends Model<MonthlyStockSummaryCountry> {
  @ForeignKey(() => Company)
  @AllowNull(true)
  @Column({ field: 'company_id', type: DataType.INTEGER })
  declare companyId: number;

  @BelongsTo(() => Company)
  declare company: Company;

  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => require('./monthly-stock-summary.model').MonthlyStockSummary)
  @AllowNull(false)
  @Column({ field: 'summary_id', type: DataType.INTEGER })
  declare summaryId: number;

  @BelongsTo(() => require('./monthly-stock-summary.model').MonthlyStockSummary, { onDelete: 'CASCADE' })
  declare summary: MonthlyStockSummary;

  @AllowNull(false)
  @Column({ field: 'iso2_code', type: DataType.STRING(10) })
  declare iso2Code: string;

  @AllowNull(false)
  @Column({ field: 'country_name', type: DataType.STRING(100) })
  declare countryName: string;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
