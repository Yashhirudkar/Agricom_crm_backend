import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AllowNull,
  Default,
  CreatedAt,
  UpdatedAt,
  DeletedAt,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { PartnerRole } from '../../masters/partner-role/partner-role.model';
import { Partner } from '../../masters/partner/partner.model';
import { Product } from '../../masters/product/product.model';
import { PackingType } from '../../masters/bag-specs/models/packing-type.model';
import { User } from '../../users/models/user.model';
import { EnquiryStatus } from '../enquiry.constants';

@Table({
  tableName: 'enquiries',
  timestamps: true,
  paranoid: true,
  indexes: [
    { fields: ['enquiry_no'] },
    { fields: ['partner_role_id'] },
    { fields: ['partner_id'] },
    { fields: ['product_id'] },
    { fields: ['status'] },
  ],
})
export class Enquiry extends Model<Enquiry> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID })
  declare id: string;

  @AllowNull(false)
  @Column({ field: 'enquiry_no', type: DataType.STRING(50) })
  declare enquiryNo: string;

  @AllowNull(false)
  @Column({ field: 'enquiry_date', type: DataType.DATEONLY })
  declare enquiryDate: Date;

  @ForeignKey(() => PartnerRole)
  @AllowNull(false)
  @Column({ field: 'partner_role_id', type: DataType.INTEGER })
  declare partnerRoleId: number;

  @BelongsTo(() => PartnerRole)
  declare partnerRole: PartnerRole;

  @ForeignKey(() => Partner)
  @AllowNull(false)
  @Column({ field: 'partner_id', type: DataType.INTEGER })
  declare partnerId: number;

  @BelongsTo(() => Partner)
  declare partner: Partner;

  @ForeignKey(() => Product)
  @AllowNull(false)
  @Column({ field: 'product_id', type: DataType.INTEGER })
  declare productId: number;

  @BelongsTo(() => Product)
  declare product: Product;

  @AllowNull(true)
  @Column({ field: 'origin_country_id', type: DataType.INTEGER })
  declare originCountryId: number;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare purity: string;

  @ForeignKey(() => PackingType)
  @AllowNull(true)
  @Column({ field: 'packing_type_id', type: DataType.INTEGER })
  declare packingTypeId: number;

  @BelongsTo(() => PackingType)
  declare packingType: PackingType;

  @Column({
    type: DataType.STRING,
    allowNull: true,
    field: 'pod_port',
  })
  podPort?: string; // Linked to sea-ports logic in service

  @AllowNull(true)
  @Column({ field: 'shipment_type', type: DataType.STRING(50) })
  declare shipmentType: string;

  @AllowNull(true)
  @Column({ type: DataType.DECIMAL(15, 4) })
  declare quantity: number;

  @AllowNull(true)
  @Column({ field: 'shipment_date', type: DataType.DATEONLY })
  declare shipmentDate: Date;

  @AllowNull(true)
  @Column({ field: 'buying_interest', type: DataType.DECIMAL(15, 4) })
  declare buyingInterest: number;

  @AllowNull(false)
  @Default(true)
  @Column({ field: 'potential_enquiry', type: DataType.BOOLEAN })
  declare potentialEnquiry: boolean;

  @AllowNull(false)
  @Default(EnquiryStatus.NEW)
  @Column({ type: DataType.STRING(50) })
  declare status: string;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'created_by', type: DataType.INTEGER })
  declare createdBy: number;

  @BelongsTo(() => User, { foreignKey: 'createdBy', onDelete: 'CASCADE' })
  declare creator: User;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'updated_by', type: DataType.INTEGER })
  declare updatedBy: number;

  @BelongsTo(() => User, { foreignKey: 'updatedBy', onDelete: 'CASCADE' })
  declare updater: User;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;

  @DeletedAt
  @Column({ field: 'deleted_at' })
  declare deletedAt: Date;
}
