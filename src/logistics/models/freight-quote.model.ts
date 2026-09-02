// Freight Quote Details Model
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
  DeletedAt,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { Logistics } from './logistics.model';
import { Partner } from '../../masters/partner/partner.model';

@Table({
  tableName: 'freight_quotes',
  timestamps: true,
  paranoid: true,
})
export class FreightQuote extends Model<FreightQuote> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @AllowNull(false)
  @Column({ field: 'quote_number', type: DataType.STRING(50) })
  declare quoteNumber: string;

  @ForeignKey(() => Logistics)
  @AllowNull(false)
  @Column({ field: 'logistics_id', type: DataType.INTEGER })
  declare logisticsId: number;

  @BelongsTo(() => Logistics, { foreignKey: 'logisticsId', constraints: false })
  declare logistics: Logistics;

  @AllowNull(false)
  @Column({ field: 'quote_date', type: DataType.DATEONLY })
  declare quoteDate: Date;

  @ForeignKey(() => Partner)
  @AllowNull(false)
  @Column({ field: 'seller_id', type: DataType.INTEGER })
  declare sellerId: number;

  @BelongsTo(() => Partner, 'sellerId')
  declare seller: Partner;

  @AllowNull(true)
  @Column({ field: 'carrier_reference_no', type: DataType.STRING(100) })
  declare carrierReferenceNo: string;

  @AllowNull(true)
  @Column({ field: 'vehicle_type', type: DataType.STRING(50) })
  declare vehicleType: string;

  @AllowNull(true)
  @Column({ field: 'container_type', type: DataType.STRING(50) })
  declare containerType: string;

  @AllowNull(true)
  @Column({ field: 'truck_type', type: DataType.STRING(50) })
  declare truckType: string;

  @AllowNull(true)
  @Column({ field: 'truck_capacity', type: DataType.STRING(50) })
  declare truckCapacity: string;

  @AllowNull(true)
  @Column({ field: 'wagon_type', type: DataType.STRING(50) })
  declare wagonType: string;

  @AllowNull(true)
  @Column({ field: 'wagon_capacity', type: DataType.STRING(50) })
  declare wagonCapacity: string;

  @AllowNull(true)
  @Column({ field: 'shipping_line', type: DataType.STRING(150) })
  declare shippingLine: string;

  @AllowNull(true)
  @Column({ field: 'contact_person', type: DataType.STRING(100) })
  declare contactPerson: string;

  @AllowNull(true)
  @Column({ field: 'contact_number', type: DataType.STRING(50) })
  declare contactNumber: string;

  @AllowNull(false)
  @Column({ field: 'freight_amount', type: DataType.DECIMAL(15, 4) })
  declare freightAmount: number;

  @AllowNull(false)
  @Default('INR')
  @Column({ type: DataType.STRING(10) })
  declare currency: string;

  @AllowNull(true)
  @Default(0)
  @Column({ field: 'fuel_charges', type: DataType.DECIMAL(15, 4) })
  declare fuelCharges: number;

  @AllowNull(true)
  @Default(0)
  @Column({ field: 'additional_charges', type: DataType.DECIMAL(15, 4) })
  declare additionalCharges: number;

  @AllowNull(false)
  @Default(0)
  @Column({ field: 'transit_days', type: DataType.INTEGER })
  declare transitDays: number;

  @AllowNull(false)
  @Column({ field: 'validity_date', type: DataType.DATEONLY })
  declare validityDate: Date;

  @AllowNull(true)
  @Column({ field: 'payment_terms', type: DataType.STRING(255) })
  declare paymentTerms: string;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare remarks: string;

  @AllowNull(false)
  @Default(false)
  @Column({ field: 'is_preferred', type: DataType.BOOLEAN })
  declare isPreferred: boolean;

  @AllowNull(false)
  @Default(false)
  @Column({ field: 'is_rejected', type: DataType.BOOLEAN })
  declare isRejected: boolean;

  @AllowNull(false)
  @Default(1)
  @Column({ type: DataType.INTEGER })
  declare version: number;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare pol: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare pod: string;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare etd: Date;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare eta: Date;

  @AllowNull(true)
  @Column({ field: 'free_days', type: DataType.INTEGER })
  declare freeDays: number;

  @AllowNull(true)
  @Column({ field: 'cutoff_date', type: DataType.DATE })
  declare cutoffDate: Date;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare vessel: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare voyage: string;

  @AllowNull(true)
  @Column({ field: 'container_size', type: DataType.STRING(50) })
  declare containerSize: string;

  @AllowNull(true)
  @Column({ field: 'created_by', type: DataType.INTEGER })
  declare createdBy: number;

  @AllowNull(true)
  @Column({ field: 'updated_by', type: DataType.INTEGER })
  declare updatedBy: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;

  @DeletedAt
  @Column({ field: 'deleted_at' })
  declare deletedAt: Date;

  // Runtime total amount getter (combining freight, fuel, and additional charges)
  get totalAmount(): number {
    return (
      Number(this.freightAmount) +
      Number(this.fuelCharges || 0) +
      Number(this.additionalCharges || 0)
    );
  }
}
