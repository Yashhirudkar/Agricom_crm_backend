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
} from 'sequelize-typescript';
import { SalesContract } from '../../sales-contracts/models/sales-contract.model';
import { Partner } from '../../masters/partner/partner.model';
import { PaymentTerm } from '../../masters/payment-term/payment-term.model';
import { PurchaseContractItem } from './purchase-contract-item.model';
import { PurchaseContractShipment } from './purchase-contract-shipment.model';
import { PurchaseContractRequiredDocument } from './purchase-contract-required-document.model';
import { PurchaseContractActivity } from './purchase-contract-activity.model';
import { PurchaseContractAttachment } from './purchase-contract-attachment.model';

/**
 * Purchase Contract execution / manual trade contract.
 */
@Table({
  tableName: 'purchase_contracts',
  timestamps: true,
  indexes: [
    { fields: ['sales_contract_id'] },
    { fields: ['status'] },
    { fields: ['purchase_type'] },
    { fields: ['buyer_id'] },
    { fields: ['seller_id'] },
  ],
})
export class PurchaseContract extends Model<PurchaseContract> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => SalesContract)
  @AllowNull(true)
  @Column({ field: 'sales_contract_id', type: DataType.INTEGER })
  declare salesContractId: number;

  @BelongsTo(() => SalesContract)
  declare salesContract: SalesContract;

  @Default('Draft')
  @AllowNull(false)
  @Column({ type: DataType.STRING(30) })
  declare status: string;

  @Default('SC')
  @AllowNull(false)
  @Column({ field: 'purchase_type', type: DataType.ENUM('SC', 'MTT') })
  declare purchaseType: string;

  @AllowNull(true)
  @Column({ field: 'contract_number', type: DataType.STRING(100) })
  declare contractNumber: string;

  @ForeignKey(() => Partner)
  @AllowNull(true)
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

  @ForeignKey(() => PaymentTerm)
  @AllowNull(true)
  @Column({ field: 'payment_term_id', type: DataType.INTEGER })
  declare paymentTermId: number;

  @BelongsTo(() => PaymentTerm)
  declare paymentTerm: PaymentTerm;

  @ForeignKey(() => Partner)
  @AllowNull(true)
  @Column({ field: 'broker_id', type: DataType.INTEGER })
  declare brokerId: number;

  @BelongsTo(() => Partner, 'brokerId')
  declare broker: Partner;

  @AllowNull(true)
  @Column({ field: 'broker_commission', type: DataType.STRING(100) })
  declare brokerCommission: string;

  /** Optional seller reference contract number */
  @AllowNull(true)
  @Column({ field: 'seller_contract_no', type: DataType.STRING(100) })
  declare sellerContractNo: string;

  /** Additional contract notes / conditions */
  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare notes: string;

  @Default([])
  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare terms: string[];

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare quantity: string;

  @AllowNull(true)
  @Column({ field: 'product_quality', type: DataType.STRING(255) })
  declare productQuality: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare packing: string;

  @AllowNull(true)
  @Column({ field: 'bag_type', type: DataType.STRING(100) })
  declare bagType: string;

  @AllowNull(true)
  @Column({ field: 'bag_spec', type: DataType.STRING(100) })
  declare bagSpec: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare stitching: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare marking: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare incoterm: string;

  @AllowNull(true)
  @Column({ field: 'delivery_place', type: DataType.STRING(255) })
  declare deliveryPlace: string;

  @AllowNull(true)
  @Column({ field: 'dispatch_date', type: DataType.DATEONLY })
  declare dispatchDate: string;

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

  // ─── Associations ─────────────────────────────────────────────────────────────
  @HasMany(() => PurchaseContractItem)
  declare items: PurchaseContractItem[];

  @HasMany(() => PurchaseContractShipment)
  declare shipmentLinks: PurchaseContractShipment[];

  @HasMany(() => PurchaseContractRequiredDocument)
  declare requiredDocuments: PurchaseContractRequiredDocument[];

  @HasMany(() => PurchaseContractActivity)
  declare activities: PurchaseContractActivity[];

  @HasMany(() => PurchaseContractAttachment)
  declare attachments: PurchaseContractAttachment[];
}
