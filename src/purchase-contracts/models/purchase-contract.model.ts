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
import { PurchaseContractShipment } from './purchase-contract-shipment.model';
import { PurchaseContractRequiredDocument } from './purchase-contract-required-document.model';
import { PurchaseContractActivity } from './purchase-contract-activity.model';
import { PurchaseContractAttachment } from './purchase-contract-attachment.model';

/**
 * Purchase Contract is an EXECUTION contract generated from an existing Sales Contract.
 * Contract number is derived at runtime as: PC-{salesContract.contractNumber}
 * No financial data stored here — always aggregated from SalesContractShipment joins.
 */
@Table({
  tableName: 'purchase_contracts',
  timestamps: true,
  indexes: [
    { fields: ['sales_contract_id'] },
    { fields: ['status'] },
  ],
})
export class PurchaseContract extends Model<PurchaseContract> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => SalesContract)
  @AllowNull(false)
  @Column({ field: 'sales_contract_id', type: DataType.INTEGER })
  declare salesContractId: number;

  @BelongsTo(() => SalesContract)
  declare salesContract: SalesContract;

  /**
   * Status lifecycle: Draft → In Progress → Awaiting Documents → Ready for Dispatch → Completed → Closed
   *                         (any early state) → Cancelled
   */
  @Default('Draft')
  @AllowNull(false)
  @Column({ type: DataType.STRING(30) })
  declare status: string;



  /** Optional seller reference contract number */
  @AllowNull(true)
  @Column({ field: 'seller_contract_no', type: DataType.STRING(100) })
  declare sellerContractNo: string;

  /** Additional contract notes / conditions */
  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare notes: string;

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
  @HasMany(() => PurchaseContractShipment)
  declare shipmentLinks: PurchaseContractShipment[];

  @HasMany(() => PurchaseContractRequiredDocument)
  declare requiredDocuments: PurchaseContractRequiredDocument[];

  @HasMany(() => PurchaseContractActivity)
  declare activities: PurchaseContractActivity[];

  @HasMany(() => PurchaseContractAttachment)
  declare attachments: PurchaseContractAttachment[];
}
