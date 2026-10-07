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
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { FreightQuote } from './freight-quote.model';
import { FreightChargeMaster } from './freight-charge-master.model';
import { FreightQuoteContainerRate } from './freight-quote-container-rate.model';
import { Company } from '../../companies/models/company.model';

@Table({
  tableName: 'freight_quote_charges',
  timestamps: true,
})
export class FreightQuoteCharge extends Model<FreightQuoteCharge> {
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

  @ForeignKey(() => FreightQuote)
  @AllowNull(false)
  @Column({ field: 'quote_id', type: DataType.INTEGER })
  declare quoteId: number;

  @BelongsTo(() => FreightQuote, { foreignKey: 'quoteId', onDelete: 'CASCADE' })
  declare quote: FreightQuote;

  @ForeignKey(() => FreightQuoteContainerRate)
  @AllowNull(true)
  @Column({ field: 'container_rate_id', type: DataType.INTEGER })
  declare containerRateId: number;

  @BelongsTo(() => FreightQuoteContainerRate, { foreignKey: 'containerRateId', onDelete: 'CASCADE' })
  declare containerRate: FreightQuoteContainerRate;

  @ForeignKey(() => FreightChargeMaster)
  @AllowNull(true)
  @Column({ field: 'charge_master_id', type: DataType.INTEGER })
  declare chargeMasterId: number;

  @BelongsTo(() => FreightChargeMaster, { foreignKey: 'chargeMasterId', onDelete: 'SET NULL' })
  declare master: FreightChargeMaster;

  @AllowNull(false)
  @Column({ field: 'charge_name', type: DataType.STRING(150) })
  declare chargeName: string;

  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(15, 4) })
  declare amount: number;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare remarks: string;

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
