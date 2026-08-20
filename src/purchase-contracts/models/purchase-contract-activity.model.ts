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
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { PurchaseContract } from './purchase-contract.model';

/**
 * Business timeline / activity log for Purchase Contracts.
 * This is NOT a replacement for the system AuditLog — it is a domain-level
 * human-readable event stream for operations teams.
 *
 * Events: PC_CREATED, SHIPMENT_ADDED, SHIPMENT_REMOVED, DOCUMENT_UPLOADED,
 *         DOCUMENT_DELETED, STATUS_CHANGED, PC_UPDATED
 *
 * Append-only — rows are never updated or deleted.
 */
@Table({
  tableName: 'purchase_contract_activities',
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['purchase_contract_id'] },
    { fields: ['created_at'] },
  ],
})
export class PurchaseContractActivity extends Model<PurchaseContractActivity> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => PurchaseContract)
  @AllowNull(false)
  @Column({ field: 'purchase_contract_id', type: DataType.INTEGER })
  declare purchaseContractId: number;

  @BelongsTo(() => PurchaseContract)
  declare purchaseContract: PurchaseContract;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare action: string;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare description: string;

  /**
   * Optional structured payload (e.g. old/new status for STATUS_CHANGED).
   */
  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare metadata: Record<string, any>;

  @AllowNull(true)
  @Column({ field: 'performed_by', type: DataType.INTEGER })
  declare performedBy: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
