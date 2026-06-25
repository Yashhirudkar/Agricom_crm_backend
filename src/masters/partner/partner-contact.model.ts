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
  tableName: 'partner_contacts',
  timestamps: true,
  indexes: [{ fields: ['partner_id'] }],
})
export class PartnerContact extends Model<PartnerContact> {
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
  @Column({ type: DataType.STRING(200) })
  declare name: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare designation: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare phone: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(255) })
  declare email: string;

  @AllowNull(true)
  @Column({ field: 'communication_type', type: DataType.STRING(50) })
  declare communicationType: string;

  @Default(false)
  @AllowNull(false)
  @Column({ field: 'is_primary', type: DataType.BOOLEAN })
  declare isPrimary: boolean;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
