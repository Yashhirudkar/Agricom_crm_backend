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
import { Partner } from '../../masters/partner/partner.model';

import { ShipmentType } from '../../masters/shipment-type/shipment-type.model';
import { PaymentTerm } from '../../masters/payment-term/payment-term.model';
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
    { fields: ['financial_year'] },
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

  @AllowNull(false)
  @Column({ field: 'financial_year', type: DataType.STRING(20) })
  declare financialYear: string;

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
  @Column({ field: 'seller_id', type: DataType.INTEGER })
  declare sellerId: number;

  @BelongsTo(() => Partner, 'sellerId')
  declare seller: Partner;

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

  @AllowNull(false)
  @Column({ field: 'origin_country', type: DataType.STRING(150) })
  declare originCountry: string;

  @AllowNull(false)
  @Column({ field: 'destination_country', type: DataType.STRING(150) })
  declare destinationCountry: string;

  @AllowNull(true)
  @Column({ field: 'port_of_loading', type: DataType.STRING(255) })
  declare portOfLoading: string;

  @AllowNull(true)
  @Column({ field: 'port_of_discharge', type: DataType.STRING(255) })
  declare portOfDischarge: string;

  // Transport Mode Routing fields (Multi-Modal)
  // Replaces portOfLoading/portOfDischarge for new contracts.

  @AllowNull(true)
  @Column({ field: 'origin_location_name', type: DataType.STRING(255) })
  declare originLocationName: string;

  @AllowNull(true)
  @Column({ field: 'destination_location_name', type: DataType.STRING(255) })
  declare destinationLocationName: string;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare remarks: string;

  // ----------------------------------------------------
  // MULTI-MODAL LOGISTICS (Added 2026-07)
  // ----------------------------------------------------

  @Column({
    field: 'origin_transport_mode',
    type: DataType.STRING(30),
    allowNull: true,
    defaultValue: 'sea',
  })
  declare originTransportMode: string;

  @Column({
    field: 'destination_transport_mode',
    type: DataType.STRING(30),
    allowNull: true,
    defaultValue: 'sea',
  })
  declare destinationTransportMode: string;

  @AllowNull(true)
  @Default([])
  @Column({ type: DataType.JSONB })
  declare terms: string[];

  @AllowNull(true)
  @Default([])
  @Column({ field: 'other_conditions', type: DataType.JSONB })
  declare otherConditions: string[];

  @AllowNull(true)
  @Column({ field: 'dispute_resolution', type: DataType.JSONB })
  declare disputeResolution: any;

  @AllowNull(true)
  @Column({ field: 'force_majeure', type: DataType.JSONB })
  declare forceMajeure: any;

  // Contract Acceptance Fields
  @AllowNull(true)
  @Column({ field: 'seller_company_name', type: DataType.STRING(255) })
  declare sellerCompanyName: string;

  @AllowNull(true)
  @Column({ field: 'seller_authorized_signatory', type: DataType.STRING(255) })
  declare sellerAuthorizedSignatory: string;

  @AllowNull(true)
  @Column({ field: 'seller_signature', type: DataType.TEXT })
  declare sellerSignature: string;

  @AllowNull(true)
  @Column({ field: 'seller_company_seal', type: DataType.TEXT })
  declare sellerCompanySeal: string;

  @AllowNull(true)
  @Column({ field: 'buyer_company_name', type: DataType.STRING(255) })
  declare buyerCompanyName: string;

  @AllowNull(true)
  @Column({ field: 'buyer_authorized_signatory', type: DataType.STRING(255) })
  declare buyerAuthorizedSignatory: string;

  @AllowNull(true)
  @Column({ field: 'buyer_signature', type: DataType.TEXT })
  declare buyerSignature: string;

  @AllowNull(true)
  @Column({ field: 'buyer_company_seal', type: DataType.TEXT })
  declare buyerCompanySeal: string;

  @AllowNull(true)
  @Column({ field: 'print_overrides', type: DataType.JSONB })
  declare printOverrides: any;

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
