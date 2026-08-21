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
import { Attachment } from '../../attachments/models/attachment.model';

@Table({
  tableName: 'purchase_contract_attachments',
  timestamps: true,
  indexes: [
    { fields: ['purchase_contract_id'] },
    { fields: ['attachment_id'] },
  ],
})
export class PurchaseContractAttachment extends Model<PurchaseContractAttachment> {
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

  @ForeignKey(() => Attachment)
  @AllowNull(false)
  @Column({ field: 'attachment_id', type: DataType.INTEGER })
  declare attachmentId: number;

  @BelongsTo(() => Attachment)
  declare attachment: Attachment;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare category: string;

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
