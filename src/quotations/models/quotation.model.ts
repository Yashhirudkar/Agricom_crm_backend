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
  Unique,
  ForeignKey,
  BelongsTo,
  HasMany,
} from 'sequelize-typescript';
import { Partner } from '../../masters/partner/partner.model';
import { PartnerFollowUp } from '../../masters/partner/partner-followup.model';
import { User } from '../../users/models/user.model';
import type { QuotationItem } from './quotation-item.model';

/**
 * Quotation status lifecycle.
 * Phase-1 uses: Draft → Generated
 * Future phases: Sent, Accepted, Rejected, Expired, Cancelled
 */
export const QUOTATION_STATUSES = [
  'Draft',
  'Generated',
  'Sent',
  'Accepted',
  'Rejected',
  'Expired',
  'Cancelled',
] as const;

export type QuotationStatus = typeof QUOTATION_STATUSES[number];

@Table({
  tableName: 'quotations',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['quotation_number'] },
    { fields: ['buyer_id'] },
    { fields: ['importer_id'] },
    { fields: ['follow_up_id'] },
    { fields: ['status'] },
    { fields: ['deleted_at'] },
    { fields: ['created_by'] },
  ],
})
export class Quotation extends Model<Quotation> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  /**
   * Auto-generated, immutable quotation number.
   * Format: AQ-YYYYMM-NNNNNN (e.g. AQ-202608-000001)
   * Set once by QuotationNumberService; never updated.
   */
  @Unique
  @AllowNull(false)
  @Column({ field: 'quotation_number', type: DataType.STRING(30) })
  declare quotationNumber: string;

  @Default('Draft')
  @AllowNull(false)
  @Column({ type: DataType.STRING(20) })
  declare status: string;

  // ─── Buyer ────────────────────────────────────────────────────────────────

  @ForeignKey(() => Partner)
  @AllowNull(false)
  @Column({ field: 'buyer_id', type: DataType.INTEGER })
  declare buyerId: number;

  @BelongsTo(() => Partner, 'buyerId')
  declare buyer: Partner;

  // ─── Importer ─────────────────────────────────────────────────────────────

  @ForeignKey(() => Partner)
  @AllowNull(true)
  @Column({ field: 'importer_id', type: DataType.INTEGER })
  declare importerId: number;

  @BelongsTo(() => Partner, 'importerId')
  declare importer: Partner;

  // ─── Destination ──────────────────────────────────────────────────────────

  /**
   * Stored as a string (country name), consistent with the rest of the project
   * (SalesContract.destinationCountry, Product.country, Partner.country).
   * No country FK table exists in this schema.
   */
  @AllowNull(false)
  @Column({ field: 'destination_country', type: DataType.STRING(150) })
  declare destinationCountry: string;

  // ─── Follow-up link ───────────────────────────────────────────────────────

  @ForeignKey(() => PartnerFollowUp)
  @AllowNull(true)
  @Column({ field: 'follow_up_id', type: DataType.INTEGER })
  declare followUpId: number;

  @BelongsTo(() => PartnerFollowUp, { foreignKey: 'followUpId', as: 'followUp' })
  declare followUp: PartnerFollowUp;

  // ─── Pricing ──────────────────────────────────────────────────────────────

  @AllowNull(false)
  @Column({ field: 'currency_code', type: DataType.STRING(10) })
  declare currencyCode: string;

  // ─── Audit: Generation ────────────────────────────────────────────────────

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'generated_by', type: DataType.INTEGER })
  declare generatedBy: number;

  @BelongsTo(() => User, { foreignKey: 'generatedBy', as: 'generatedByUser' })
  declare generatedByUser: User;

  @AllowNull(true)
  @Column({ field: 'generated_at', type: DataType.DATE })
  declare generatedAt: Date;

  // ─── Audit: Last Modification ─────────────────────────────────────────────

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'last_modified_by', type: DataType.INTEGER })
  declare lastModifiedBy: number;

  @BelongsTo(() => User, { foreignKey: 'lastModifiedBy', as: 'lastModifiedByUser' })
  declare lastModifiedByUser: User;

  @AllowNull(true)
  @Column({ field: 'last_modified_at', type: DataType.DATE })
  declare lastModifiedAt: Date;

  // ─── Audit: Creation ──────────────────────────────────────────────────────

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'created_by', type: DataType.INTEGER })
  declare createdBy: number;

  @BelongsTo(() => User, { foreignKey: 'createdBy', as: 'createdByUser' })
  declare createdByUser: User;

  // ─── Soft Delete ──────────────────────────────────────────────────────────

  @AllowNull(true)
  @Column({ field: 'deleted_at', type: DataType.DATE })
  declare deletedAt: Date;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'deleted_by', type: DataType.INTEGER })
  declare deletedBy: number;

  @BelongsTo(() => User, { foreignKey: 'deletedBy', as: 'deletedByUser' })
  declare deletedByUser: User;

  // ─── Timestamps ───────────────────────────────────────────────────────────

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;

  // ─── Associations ─────────────────────────────────────────────────────────

  @HasMany(() => require('./quotation-item.model').QuotationItem, { as: 'items', onDelete: 'CASCADE', hooks: true })
  declare items: QuotationItem[];
}
