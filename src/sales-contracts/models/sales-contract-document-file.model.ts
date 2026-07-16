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
import { SalesContract } from './sales-contract.model';
import { TradeDocument } from '../../masters/trade-document/trade-document.model';
import { Attachment } from '../../attachments/models/attachment.model';

@Table({
  tableName: 'sales_contract_document_files',
  timestamps: true,
  indexes: [
    {
      name: 'idx_sales_contract_trade_doc',
      unique: true,
      fields: ['sales_contract_id', 'trade_document_id'],
    },
  ],
})
export class SalesContractDocumentFile extends Model<SalesContractDocumentFile> {
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

  @ForeignKey(() => TradeDocument)
  @AllowNull(false)
  @Column({ field: 'trade_document_id', type: DataType.INTEGER })
  declare tradeDocumentId: number;

  @BelongsTo(() => TradeDocument)
  declare tradeDocument: TradeDocument;

  @ForeignKey(() => Attachment)
  @AllowNull(false)
  @Column({ field: 'attachment_id', type: DataType.INTEGER })
  declare attachmentId: number;

  @BelongsTo(() => Attachment)
  declare attachment: Attachment;

  @AllowNull(true)
  @Column({ field: 'uploaded_by', type: DataType.INTEGER })
  declare uploadedBy: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
