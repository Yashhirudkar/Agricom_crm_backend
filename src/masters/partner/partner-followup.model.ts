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
} from 'sequelize-typescript';
import { Partner } from './partner.model';

@Table({
  tableName: 'partner_followups',
  timestamps: true,
  indexes: [{ fields: ['partner_id'] }, { fields: ['status'] }, { fields: ['followup_date'] }],
})
export class PartnerFollowUp extends Model<PartnerFollowUp> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Partner)
  @AllowNull(false)
  @Column({ field: 'partner_id', type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare partnerId: number;

  @BelongsTo(() => Partner)
  declare partner: Partner;

  @AllowNull(true)
  @Column({ field: 'entity_type', type: DataType.STRING(50) })
  declare entityType: string;

  @AllowNull(true)
  @Column({ field: 'entity_id', type: DataType.INTEGER })
  declare entityId: number;

  @AllowNull(true)
  @Column({ field: 'workspace_id', type: DataType.INTEGER })
  declare workspaceId: number;

  @AllowNull(true)
  @Column({ field: 'created_by', type: DataType.INTEGER })
  declare createdBy: number;

  @AllowNull(false)
  @Column({ field: 'followup_date', type: DataType.DATE })
  declare followupDate: Date;

  @AllowNull(false)
  @Column({ field: 'communication_type', type: DataType.STRING(50) })
  declare communicationType: string;

  @AllowNull(true)
  @Column({ field: 'buyer_remark', type: DataType.TEXT })
  declare buyerRemark: string;

  @AllowNull(true)
  @Column({ field: 'our_response', type: DataType.TEXT })
  declare ourResponse: string;

  @AllowNull(true)
  @Column({ field: 'next_followup_date', type: DataType.DATE })
  declare nextFollowupDate: Date;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare priority: string;

  @AllowNull(false)
  @Default('Pending')
  @Column({ type: DataType.STRING(50) })
  declare status: string;

  @Default(true)
  @AllowNull(false)
  @Column({ field: 'is_active', type: DataType.BOOLEAN })
  declare isActive: boolean;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
