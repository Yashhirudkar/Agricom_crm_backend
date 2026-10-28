import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  CreatedAt,
  ForeignKey,
  BelongsTo,
  Index,
} from 'sequelize-typescript';
import { Enquiry } from './enquiry.model';
import { User } from '../../users/models/user.model';

export enum EnquiryActivityType {
  ENQUIRY_CREATED = 'ENQUIRY_CREATED',
  BID_UPDATED = 'BID_UPDATED',
  OFFER_UPDATED = 'OFFER_UPDATED',
  PRICE_UPDATED = 'PRICE_UPDATED',
  WHATSAPP_SENT = 'WHATSAPP_SENT',
  WHATSAPP_RECEIVED = 'WHATSAPP_RECEIVED',
  FOLLOW_UP = 'FOLLOW_UP',
  QUOTATION_CREATED = 'QUOTATION_CREATED',
  ORDER_CREATED = 'ORDER_CREATED',
  STATUS_CHANGED = 'STATUS_CHANGED',
}

@Table({
  tableName: 'enquiry_activity_logs',
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['enquiry_id'] },
    { fields: ['activity_type'] },
    { fields: ['created_at'] },
  ],
})
export class EnquiryActivityLog extends Model<EnquiryActivityLog> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.BIGINT })
  declare id: number;

  @ForeignKey(() => Enquiry)
  @AllowNull(false)
  @Index
  @Column({ field: 'enquiry_id', type: DataType.UUID })
  declare enquiryId: string;

  @BelongsTo(() => Enquiry, { foreignKey: 'enquiryId', onDelete: 'CASCADE' })
  declare enquiry: Enquiry;

  @AllowNull(false)
  @Index
  @Column({ field: 'activity_type', type: DataType.STRING(50) })
  declare activityType: EnquiryActivityType | string;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare message: string | null;

  @AllowNull(true)
  @Column({ field: 'bid_amount', type: DataType.DECIMAL(15, 4) })
  declare bidAmount: number | null;

  @AllowNull(true)
  @Column({ field: 'offer_amount', type: DataType.DECIMAL(15, 4) })
  declare offerAmount: number | null;

  @AllowNull(true)
  @Column({ field: 'currency', type: DataType.STRING(10) })
  declare currency: string | null;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'changed_by_user_id', type: DataType.INTEGER })
  declare changedByUserId: number | null;

  @BelongsTo(() => User, { foreignKey: 'changedByUserId', as: 'changedBy', onDelete: 'SET NULL' })
  declare changedBy: User;

  @AllowNull(true)
  @Column({ field: 'whatsapp_message_id', type: DataType.STRING(255) })
  declare whatsappMessageId: string | null;

  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare metadata: Record<string, any> | null;

  @CreatedAt
  @Index
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}

