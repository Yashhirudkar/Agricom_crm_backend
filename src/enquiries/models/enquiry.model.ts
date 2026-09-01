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
  HasOne,
} from 'sequelize-typescript';
import { PartnerRole } from '../../masters/partner-role/partner-role.model';
import { Partner } from '../../masters/partner/partner.model';
import { Product } from '../../masters/product/product.model';
import { PackingType } from '../../masters/bag-specs/models/packing-type.model';
import { User } from '../../users/models/user.model';
import { EnquiryStatus, EnquiryShipmentMode } from '../enquiry.constants';
import { Logistics } from '../../logistics/models/logistics.model';

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
  @Column({ field: 'origin_country_id', type: DataType.STRING })
  declare originCountryId: string;

  @AllowNull(true)
  @Column({ field: 'shipment_mode', type: DataType.STRING(50) })
  declare shipmentMode: EnquiryShipmentMode;

  @AllowNull(true)
  @Column({ field: 'origin_port', type: DataType.STRING(100) })
  declare originPort: string;

  @AllowNull(true)
  @Column({ field: 'destination_port', type: DataType.STRING(100) })
  declare destinationPort: string;

  @AllowNull(true)
  @Column({ field: 'origin_state', type: DataType.STRING(100) })
  declare originState: string;

  @AllowNull(true)
  @Column({ field: 'origin_city', type: DataType.STRING(100) })
  declare originCity: string;

  @AllowNull(true)
  @Column({ field: 'destination_country', type: DataType.STRING(100) })
  declare destinationCountry: string;

  @AllowNull(true)
  @Column({ field: 'destination_state', type: DataType.STRING(100) })
  declare destinationState: string;

  @AllowNull(true)
  @Column({ field: 'destination_city', type: DataType.STRING(100) })
  declare destinationCity: string;

  @AllowNull(true)
  @Column({ field: 'bid_currency', type: DataType.STRING(10) })
  declare bidCurrency: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare purity: string;

  @ForeignKey(() => PackingType)
  @AllowNull(true)
  @Column({ field: 'packing_type_id', type: DataType.INTEGER })
  declare packingTypeId: number;

  @BelongsTo(() => PackingType)
  declare packingType: PackingType;

  /**
   * @deprecated Use destinationPort instead. Kept for legacy contract conversion logic.
   */
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

  @HasOne(() => Logistics)
  declare logistics: Logistics;
}
