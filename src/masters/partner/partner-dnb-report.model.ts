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
import { Partner } from './partner.model';

@Table({
  tableName: 'partner_dnb_reports',
  timestamps: false,
  indexes: [
    { fields: ['partner_id'] },
    { fields: ['is_latest'] },
    { fields: ['created_at'] },
  ],
})
export class PartnerDnbReport extends Model<PartnerDnbReport> {
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

  @AllowNull(false)
  @Column({ field: 'report_date', type: DataType.DATEONLY })
  declare reportDate: string;

  @AllowNull(false)
  @Column({ field: 'report_file', type: DataType.STRING(500) })
  declare reportFile: string;

  @AllowNull(false)
  @Column({ field: 'original_file_name', type: DataType.STRING(255) })
  declare originalFileName: string;

  @AllowNull(false)
  @Column({ field: 'mime_type', type: DataType.STRING(100) })
  declare mimeType: string;

  @AllowNull(false)
  @Column({ field: 'file_size', type: DataType.INTEGER })
  declare fileSize: number;

  @AllowNull(false)
  @Column({ field: 'risk_factor', type: DataType.STRING(20) })
  declare riskFactor: string; // 'LOW' | 'MODERATE' | 'HIGH'

  @AllowNull(false)
  @Column({ field: 'credit_limit', type: DataType.DECIMAL(15, 2) })
  declare creditLimit: number;

  @AllowNull(false)
  @Column({ field: 'failure_score', type: DataType.STRING(50) })
  declare failureScore: string; // 'HIGH_RISK' | 'MODERATE_HIGH' | 'MODERATE' | 'MODERATE_LOW' | 'LOW_RISK'

  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare paydex: number;

  @AllowNull(false)
  @Column({ field: 'dnb_rating', type: DataType.STRING(50) })
  declare dnbRating: string;

  @AllowNull(false)
  @Default('MANUAL')
  @Column({ type: DataType.STRING(20) })
  declare source: string; // 'MANUAL' | 'DNB_API' | 'IMPORT'

  @Default(true)
  @AllowNull(false)
  @Column({ field: 'is_latest', type: DataType.BOOLEAN })
  declare isLatest: boolean;

  @AllowNull(true)
  @Column({ field: 'created_by', type: DataType.INTEGER })
  declare createdBy: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
