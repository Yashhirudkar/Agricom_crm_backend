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
import { User } from '../../users/models/user.model';
import { Company } from '../../companies/models/company.model';
import { MonthlyStockSummaryCountry } from './monthly-stock-summary-country.model';
import { MonthlyStockSection } from './monthly-stock-section.model';

@Table({
  tableName: 'monthly_stock_summaries',
  timestamps: true,
  paranoid: true,
})
export class MonthlyStockSummary extends Model<MonthlyStockSummary> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare month: number; // 1 = January, 12 = December

  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare year: number;

  @AllowNull(false)
  @Default('Draft')
  @Column({ type: DataType.STRING(50) })
  declare status: string;

  @ForeignKey(() => Company)
  @AllowNull(true)
  @Column({ field: 'company_id', type: DataType.INTEGER })
  declare companyId: number;

  @BelongsTo(() => Company)
  declare company: Company;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'created_by', type: DataType.INTEGER })
  declare createdBy: number;

  @BelongsTo(() => User, { foreignKey: 'createdBy', as: 'creator' })
  declare creator: User;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'updated_by', type: DataType.INTEGER })
  declare updatedBy: number;

  @BelongsTo(() => User, { foreignKey: 'updatedBy', as: 'updater' })
  declare updater: User;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'published_by', type: DataType.INTEGER })
  declare publishedBy: number;

  @BelongsTo(() => User, { foreignKey: 'publishedBy', as: 'publisher' })
  declare publisher: User;

  @AllowNull(true)
  @Column({ field: 'published_at', type: DataType.DATE })
  declare publishedAt: Date;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;

  @DeletedAt
  @Column({ field: 'deleted_at' })
  declare deletedAt: Date;

  @HasMany(() => MonthlyStockSummaryCountry, { foreignKey: 'summaryId', onDelete: 'CASCADE' })
  declare countries: MonthlyStockSummaryCountry[];

  @HasMany(() => MonthlyStockSection, { foreignKey: 'monthlyStockSummaryId', onDelete: 'CASCADE' })
  declare sections: MonthlyStockSection[];
}

