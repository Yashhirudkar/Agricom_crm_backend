import {
  AllowNull,
  AutoIncrement,
  Column,
  CreatedAt,
  DataType,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from 'sequelize-typescript';

@Table({
  tableName: 'business_transactions',
  timestamps: true,
  updatedAt: false,
  indexes: [
    { unique: true, fields: ['business_reference'] },
    { unique: true, fields: ['origin_type', 'origin_id'] },
    { fields: ['company_id'] },
  ],
})
export class BusinessTransaction extends Model<BusinessTransaction> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.BIGINT })
  declare id: number;

  @Unique
  @AllowNull(false)
  @Column({ field: 'business_reference', type: DataType.STRING(20) })
  declare businessReference: string;

  @AllowNull(false)
  @Column({ field: 'origin_type', type: DataType.STRING(40) })
  declare originType: string;

  @AllowNull(false)
  @Column({ field: 'origin_id', type: DataType.STRING(64) })
  declare originId: string;

  @AllowNull(true)
  @Column({ field: 'company_id', type: DataType.INTEGER })
  declare companyId: number;

  @AllowNull(true)
  @Column({ field: 'created_by', type: DataType.INTEGER })
  declare createdBy: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
