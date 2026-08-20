import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { PurchaseContract } from './purchase-contract.model';
import { TradeDocument } from '../../masters/trade-document/trade-document.model';
import { Attachment } from '../../attachments/models/attachment.model';

/**
 * Tracks which trade documents are required for this Purchase Contract
 * and whether they have been uploaded via the Attachments engine.
 * Unique per (purchase_contract_id, trade_document_id) — one row per document type.
 */
@Table({
  tableName: 'purchase_contract_required_documents',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['purchase_contract_id', 'trade_document_id'] },
  ],
})
export class PurchaseContractRequiredDocument extends Model<PurchaseContractRequiredDocument> {
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

  @ForeignKey(() => TradeDocument)
  @AllowNull(false)
  @Column({ field: 'trade_document_id', type: DataType.INTEGER })
  declare tradeDocumentId: number;

  @BelongsTo(() => TradeDocument)
  declare tradeDocument: TradeDocument;

  @ForeignKey(() => Attachment)
  @AllowNull(true)
  @Column({ field: 'attachment_id', type: DataType.INTEGER })
  declare attachmentId: number | null;

  @BelongsTo(() => Attachment)
  declare attachment: Attachment;

  @AllowNull(true)
  @Column({ field: 'uploaded_by', type: DataType.INTEGER })
  declare uploadedBy: number | null;

  @AllowNull(true)
  @Column({ field: 'uploaded_at', type: DataType.DATE })
  declare uploadedAt: Date | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
