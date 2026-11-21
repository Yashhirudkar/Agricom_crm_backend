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
  Index,
} from 'sequelize-typescript';
import { Company } from '../../companies/models/company.model';
import { SalesContract } from '../../sales-contracts/models/sales-contract.model';
import { SalesContractShipment } from '../../sales-contracts/models/sales-contract-shipment.model';
import { PurchaseContract } from '../../purchase-contracts/models/purchase-contract.model';
import { User } from '../../users/models/user.model';

export interface ExportGoodsItem {
  id?: string | number;
  marksAndNos: string;
  containerNo: string;
  noAndKindOfPackages: string;
  descriptionOfGoods: string;
  quantity: number;
  quantityUnit?: string;
  rate: number;
  amount: number;
}

export interface BankDetailsSnapshot {
  bankName: string;
  accountName?: string;
  accountNumber: string;
  iban?: string;
  swiftCode?: string;
  branch?: string;
  currency?: string;
  additionalDetails?: string;
  formattedText?: string;
  bankDetailsText?: string;
  selectedDomesticBankId?: number;
  selectedCurrency?: string;
  resolvedNostroBankId?: number | null;
  domesticBank?: any;
  nostroBank?: any;
  [key: string]: any;
}

@Table({
  tableName: 'export_invoices',
  timestamps: true,
  indexes: [
    { fields: ['invoice_number'], unique: true },
    { fields: ['sales_contract_id'] },
    { fields: ['shipment_id'] },
    { fields: ['company_id'] },
    { fields: ['status'] },
    { fields: ['invoice_date'] },
  ],
})
export class ExportInvoice extends Model<ExportInvoice> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Company)
  @AllowNull(true)
  @Column({ field: 'company_id', type: DataType.INTEGER })
  declare companyId: number | null;

  @BelongsTo(() => Company)
  declare company: Company;

  @ForeignKey(() => SalesContract)
  @AllowNull(true)
  @Column({ field: 'sales_contract_id', type: DataType.INTEGER })
  declare salesContractId: number | null;

  @BelongsTo(() => SalesContract)
  declare salesContract: SalesContract;

  @ForeignKey(() => SalesContractShipment)
  @AllowNull(true)
  @Column({ field: 'shipment_id', type: DataType.INTEGER })
  declare shipmentId: number | null;

  @BelongsTo(() => SalesContractShipment)
  declare shipment: SalesContractShipment;

  @ForeignKey(() => PurchaseContract)
  @AllowNull(true)
  @Column({ field: 'purchase_contract_id', type: DataType.INTEGER })
  declare purchaseContractId: number | null;

  @BelongsTo(() => PurchaseContract)
  declare purchaseContract: PurchaseContract;

  @AllowNull(false)
  @Column({ field: 'invoice_number', type: DataType.STRING(100), unique: true })
  declare invoiceNumber: string;

  declare businessReference?: string;

  @Default(1)
  @AllowNull(false)
  @Column({ field: 'sequence_number', type: DataType.INTEGER })
  declare sequenceNumber: number;

  @AllowNull(false)
  @Column({ field: 'invoice_date', type: DataType.DATEONLY })
  declare invoiceDate: string;

  @Default('Draft')
  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare status: string; // 'Draft' | 'Issued' | 'Cancelled' | 'Paid'

  @Default('I.E.C. NO.0307027422')
  @AllowNull(false)
  @Column({ field: 'exporter_ref', type: DataType.STRING(100) })
  declare exporterRef: string;

  @AllowNull(true)
  @Column({ field: 'seller_order_no', type: DataType.STRING(100) })
  declare sellerOrderNo: string | null;

  @AllowNull(true)
  @Column({ field: 'seller_order_date', type: DataType.DATEONLY })
  declare sellerOrderDate: string | null;

  @AllowNull(true)
  @Column({ field: 'other_ref', type: DataType.STRING(255) })
  declare otherRef: string | null;

  @AllowNull(true)
  @Column({ field: 'buyer_order_no', type: DataType.STRING(100) })
  declare buyerOrderNo: string | null;

  @AllowNull(true)
  @Column({ field: 'buyer_order_date', type: DataType.DATEONLY })
  declare buyerOrderDate: string | null;

  @AllowNull(true)
  @Column({ field: 'seller_details', type: DataType.JSONB })
  declare sellerDetails: any;

  @AllowNull(true)
  @Column({ field: 'consignee_details', type: DataType.JSONB })
  declare consigneeDetails: any;

  @AllowNull(true)
  @Column({ field: 'notify_party_details', type: DataType.JSONB })
  declare notifyPartyDetails: any;

  @AllowNull(true)
  @Column({ field: 'buyer_other_than_consignee', type: DataType.JSONB })
  declare buyerOtherThanConsignee: any;

  @AllowNull(true)
  @Column({ field: 'country_of_origin', type: DataType.STRING(150) })
  declare countryOfOrigin: string;

  @AllowNull(true)
  @Column({ field: 'country_of_final_destination', type: DataType.STRING(150) })
  declare countryOfFinalDestination: string;

  @AllowNull(true)
  @Column({ field: 'terms_of_delivery_payment', type: DataType.TEXT })
  declare termsOfDeliveryPayment: string;

  @Default('ROAD')
  @AllowNull(true)
  @Column({ field: 'carriage_by', type: DataType.STRING(100) })
  declare carriageBy: string;

  @AllowNull(true)
  @Column({ field: 'place_of_loading', type: DataType.STRING(255) })
  declare placeOfLoading: string;

  @AllowNull(true)
  @Column({ field: 'place_of_unloading', type: DataType.STRING(255) })
  declare placeOfUnloading: string;

  @AllowNull(true)
  @Column({ field: 'final_destination', type: DataType.STRING(255) })
  declare finalDestination: string;

  @Default([])
  @AllowNull(true)
  @Column({ field: 'truck_numbers', type: DataType.JSONB })
  declare truckNumbers: string[];

  @Default([])
  @AllowNull(true)
  @Column({ field: 'container_numbers', type: DataType.JSONB })
  declare containerNumbers: string[];

  @Default([])
  @AllowNull(true)
  @Column({ field: 'goods_items', type: DataType.JSONB })
  declare goodsItems: ExportGoodsItem[];

  @Default('USD')
  @AllowNull(false)
  @Column({ type: DataType.STRING(10) })
  declare currency: string;

  @Default(0)
  @AllowNull(false)
  @Column({ field: 'total_quantity', type: DataType.DECIMAL(14, 3) })
  declare totalQuantity: number;

  @Default(0)
  @AllowNull(false)
  @Column({ field: 'total_amount', type: DataType.DECIMAL(16, 2) })
  declare totalAmount: number;

  @Default(0)
  @AllowNull(false)
  @Column({ field: 'amount_chargeable', type: DataType.DECIMAL(16, 2) })
  declare amountChargeable: number;

  @AllowNull(true)
  @Column({ field: 'amount_in_words', type: DataType.TEXT })
  declare amountInWords: string;

  @AllowNull(true)
  @Column({ field: 'bank_key', type: DataType.STRING(100) })
  declare bankKey: string | null;

  @AllowNull(true)
  @Column({ field: 'bank_details', type: DataType.JSONB })
  declare bankDetails: BankDetailsSnapshot | null;

  @Default('WE HEREBY CERTIFY THAT THE GOODS SUPPLIED ARE OF 100% KAZAKHSTAN ORIGIN.')
  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare declaration: string;

  @AllowNull(true)
  @Column({ field: 'signature_url', type: DataType.TEXT })
  declare signatureUrl: string | null;

  @AllowNull(true)
  @Column({ field: 'stamp_url', type: DataType.TEXT })
  declare stampUrl: string | null;

  @AllowNull(true)
  @Column({ field: 'signatory_name', type: DataType.STRING(255) })
  declare signatoryName: string | null;

  @AllowNull(true)
  @Column({ field: 'signatory_designation', type: DataType.STRING(255) })
  declare signatoryDesignation: string | null;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare remarks: string | null;

  @Default({})
  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare metadata: any;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'created_by', type: DataType.INTEGER })
  declare createdBy: number | null;

  @BelongsTo(() => User, 'createdBy')
  declare creatorUser: User;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'updated_by', type: DataType.INTEGER })
  declare updatedBy: number | null;

  @BelongsTo(() => User, 'updatedBy')
  declare updaterUser: User;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}

