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
  HasMany,
  Unique,
} from 'sequelize-typescript';
import { FinancialYear } from '../../masters/financial-year/financial-year.model';
import { Partner } from '../../masters/partner/partner.model';

import { ShipmentType } from '../../masters/shipment-type/shipment-type.model';
import { PaymentTerm } from '../../masters/payment-term/payment-term.model';
import { Country } from '../../masters/country/country.model';
import { SalesContractItem } from './sales-contract-item.model';
import { SalesContractShipment } from './sales-contract-shipment.model';
import { SalesContractDocument } from './sales-contract-document.model';
import { SalesContractDocumentFile } from './sales-contract-document-file.model';

@Table({
  tableName: 'sales_contracts',
  timestamps: true,
  indexes: [
    { fields: ['status'] }, 
    { fields: ['contract_number'] },
    { fields: ['buyer_id'] },
    { fields: ['financial_year_id'] }
  ],
})
export class SalesContract extends Model<SalesContract> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @Unique
  @AllowNull(false)
  @Column({ field: 'contract_number', type: DataType.STRING(50) })
  declare contractNumber: string;

  @ForeignKey(() => FinancialYear)
  @AllowNull(false)
  @Column({ field: 'financial_year_id', type: DataType.INTEGER })
  declare financialYearId: number;

  @BelongsTo(() => FinancialYear)
  declare financialYear: FinancialYear;

  @AllowNull(false)
  @Column({ field: 'contract_date', type: DataType.DATEONLY })
  declare contractDate: Date;

  @ForeignKey(() => Partner)
  @AllowNull(false)
  @Column({ field: 'buyer_id', type: DataType.INTEGER })
  declare buyerId: number;

  @BelongsTo(() => Partner, 'buyerId')
  declare buyer: Partner;

  @ForeignKey(() => Partner)
  @AllowNull(true)
  @Column({ field: 'broker_id', type: DataType.INTEGER })
  declare brokerId: number;

  @BelongsTo(() => Partner, 'brokerId')
  declare broker: Partner;

  @AllowNull(false)
  @Column({ field: 'currency_code', type: DataType.STRING(10) })
  declare currencyCode: string;

  @Default(0)
  @AllowNull(false)
  @Column({ field: 'total_quantity', type: DataType.DECIMAL(12, 2) })
  declare totalQuantity: number;

  @Default(0)
  @AllowNull(false)
  @Column({ field: 'total_amount', type: DataType.DECIMAL(15, 2) })
  declare totalAmount: number;

  @ForeignKey(() => ShipmentType)
  @AllowNull(false)
  @Column({ field: 'shipment_type_id', type: DataType.INTEGER })
  declare shipmentTypeId: number;

  @BelongsTo(() => ShipmentType)
  declare shipmentType: ShipmentType;

  @ForeignKey(() => PaymentTerm)
  @AllowNull(false)
  @Column({ field: 'payment_term_id', type: DataType.INTEGER })
  declare paymentTermId: number;

  @BelongsTo(() => PaymentTerm)
  declare paymentTerm: PaymentTerm;

  @ForeignKey(() => Country)
  @AllowNull(false)
  @Column({ field: 'origin_country_id', type: DataType.INTEGER })
  declare originCountryId: number;

  @BelongsTo(() => Country, 'originCountryId')
  declare originCountry: Country;

  @ForeignKey(() => Country)
  @AllowNull(false)
  @Column({ field: 'destination_country_id', type: DataType.INTEGER })
  declare destinationCountryId: number;

  @BelongsTo(() => Country, 'destinationCountryId')
  declare destinationCountry: Country;

  @AllowNull(true)
  @Column({ field: 'port_of_loading', type: DataType.STRING(255) })
  declare portOfLoading: string;

  @AllowNull(true)
  @Column({ field: 'port_of_discharge', type: DataType.STRING(255) })
  declare portOfDischarge: string;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare remarks: string;

  @Default('Draft')
  @AllowNull(false)
  @Column({ type: DataType.STRING(20) })
  declare status: string;

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

  @HasMany(() => SalesContractItem)
  declare items: SalesContractItem[];

  @HasMany(() => SalesContractShipment)
  declare shipments: SalesContractShipment[];

  @HasMany(() => SalesContractDocument)
  declare documents: SalesContractDocument[];

  @HasMany(() => SalesContractDocumentFile)
  declare documentFiles: SalesContractDocumentFile[];
}
