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
  HasMany,
} from 'sequelize-typescript';
import { CargoAvailability } from './cargo-availability.model';
import { CargoShipmentAllocation } from './cargo-shipment-allocation.model';
import { SalesContractShipment } from '../../sales-contracts/models/sales-contract-shipment.model';
import { Partner } from '../../masters/partner/partner.model';
import { User } from '../../users/models/user.model';
import { CargoDocument } from './cargo-document.model';

@Table({
  tableName: 'cargo_loading',
  timestamps: true,
  indexes: [
    { fields: ['cargo_availability_id'] },
    { fields: ['shipment_id'] },
    { fields: ['truck_no'] },
    { fields: ['status'] },
    { fields: ['loading_date'] },
  ],
})
export class CargoLoading extends Model<CargoLoading> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => CargoAvailability)
  @AllowNull(true)
  @Column({ field: 'cargo_availability_id', type: DataType.INTEGER })
  declare cargoAvailabilityId: number | null;

  @BelongsTo(() => CargoAvailability)
  declare cargoAvailability: CargoAvailability;

  @ForeignKey(() => CargoShipmentAllocation)
  @AllowNull(true)
  @Column({ field: 'shipment_allocation_id', type: DataType.INTEGER })
  declare shipmentAllocationId: number;

  @BelongsTo(() => CargoShipmentAllocation)
  declare shipmentAllocation: CargoShipmentAllocation;

  @ForeignKey(() => SalesContractShipment)
  @AllowNull(false)
  @Column({ field: 'shipment_id', type: DataType.INTEGER })
  declare shipmentId: number;

  @BelongsTo(() => SalesContractShipment)
  declare shipment: SalesContractShipment;

  @ForeignKey(() => Partner)
  @AllowNull(true)
  @Column({ field: 'warehouse_id', type: DataType.INTEGER })
  declare warehouseId: number;

  @BelongsTo(() => Partner, 'warehouseId')
  declare warehouse: Partner;

  @AllowNull(true)
  @Column({ field: 'warehouse_name', type: DataType.STRING(255) })
  declare warehouseName: string;

  @AllowNull(true)
  @Column({ field: 'loading_date', type: DataType.DATEONLY })
  declare loadingDate: string;

  @AllowNull(true)
  @Column({ field: 'arrival_time', type: DataType.STRING(50) })
  declare arrivalTime: string;

  @AllowNull(false)
  @Column({ field: 'truck_no', type: DataType.STRING(100) })
  declare truckNo: string;

  @AllowNull(true)
  @Column({ field: 'trailer_no', type: DataType.STRING(100) })
  declare trailerNo: string;

  @AllowNull(true)
  @Column({ field: 'driver_name', type: DataType.STRING(255) })
  declare driverName: string;

  @AllowNull(true)
  @Column({ field: 'driver_mobile', type: DataType.STRING(50) })
  declare driverMobile: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(255) })
  declare transporter: string;

  @AllowNull(true)
  @Column({ field: 'license_number', type: DataType.STRING(100) })
  declare licenseNumber: string;

  @AllowNull(true)
  @Column({ field: 'vehicle_type', type: DataType.STRING(100) })
  declare vehicleType: string;

  @Default('Bag')
  @AllowNull(true)
  @Column({ field: 'bag_bulk', type: DataType.STRING(50) })
  declare bagBulk: string;

  @Default(0)
  @AllowNull(true)
  @Column({ field: 'bags_count', type: DataType.INTEGER })
  declare bagsCount: number;

  @Default(0)
  @AllowNull(true)
  @Column({ field: 'loaded_qty', type: DataType.DECIMAL(12, 2) })
  declare loadedQty: number;

  @Default(0)
  @AllowNull(true)
  @Column({ field: 'loaded_weight', type: DataType.DECIMAL(12, 2) })
  declare loadedWeight: number;

  @Default(0)
  @AllowNull(true)
  @Column({ field: 'avg_bag_weight', type: DataType.DECIMAL(12, 2) })
  declare avgBagWeight: number;

  @AllowNull(true)
  @Column({ field: 'seal_number', type: DataType.STRING(100) })
  declare sealNumber: string;

  @AllowNull(true)
  @Column({ field: 'container_number', type: DataType.STRING(100) })
  declare containerNumber: string;

  @AllowNull(true)
  @Column({ field: 'loading_location', type: DataType.STRING(255) })
  declare loadingLocation: string;

  @AllowNull(true)
  @Column({ field: 'stack_number', type: DataType.STRING(100) })
  declare stackNumber: string;

  @AllowNull(true)
  @Column({ field: 'lot_number', type: DataType.STRING(100) })
  declare lotNumber: string;

  @AllowNull(true)
  @Column({ field: 'batch_number', type: DataType.STRING(100) })
  declare batchNumber: string;

  @Default(0)
  @AllowNull(true)
  @Column({ field: 'weighment_in_weight', type: DataType.DECIMAL(12, 2) })
  declare weighmentInWeight: number;

  @Default(0)
  @AllowNull(true)
  @Column({ field: 'weighment_out_weight', type: DataType.DECIMAL(12, 2) })
  declare weighmentOutWeight: number;

  @AllowNull(true)
  @Column({ field: 'unload_location', type: DataType.STRING(255) })
  declare unloadLocation: string;

  @Default(0)
  @AllowNull(true)
  @Column({ field: 'unloaded_weight', type: DataType.DECIMAL(12, 2) })
  declare unloadedWeight: number;

  @Default(0)
  @AllowNull(true)
  @Column({ field: 'weight_difference', type: DataType.DECIMAL(12, 2) })
  declare weightDifference: number;

  @Default(0)
  @AllowNull(true)
  @Column({ field: 'short_qty', type: DataType.DECIMAL(12, 2) })
  declare shortQty: number;

  @Default(0)
  @AllowNull(true)
  @Column({ field: 'damage_qty', type: DataType.DECIMAL(12, 2) })
  declare damageQty: number;

  @AllowNull(true)
  @Column({ field: 'difference_reason', type: DataType.TEXT })
  declare differenceReason: string;

  @Default('Normal')
  @AllowNull(false)
  @Column({ field: 'variance_level', type: DataType.STRING(50) })
  declare varianceLevel: string;

  @Default('Pending Verification')
  @AllowNull(false)
  @Column({ field: 'verification_status', type: DataType.STRING(50) })
  declare verificationStatus: string;

  @AllowNull(true)
  @Column({ field: 'unloading_date', type: DataType.DATEONLY })
  declare unloadingDate: string;

  @AllowNull(true)
  @Column({ field: 'received_by', type: DataType.STRING(255) })
  declare receivedBy: string;

  @AllowNull(true)
  @Column({ field: 'receiver_contact', type: DataType.STRING(100) })
  declare receiverContact: string;

  @AllowNull(true)
  @Column({ field: 'eway_bill_no', type: DataType.STRING(100) })
  declare ewayBillNo: string;

  @AllowNull(true)
  @Column({ field: 'lr_number', type: DataType.STRING(100) })
  declare lrNumber: string;

  @AllowNull(true)
  @Column({ field: 'invoice_number', type: DataType.STRING(100) })
  declare invoiceNumber: string;

  @AllowNull(true)
  @Column({ field: 'gate_pass_number', type: DataType.STRING(100) })
  declare gatePassNumber: string;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare remarks: string;

  @Default([])
  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare timeline: any[];

  @Default('Draft')
  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare status: string;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'verified_by', type: DataType.INTEGER })
  declare verifiedBy: number;

  @BelongsTo(() => User, 'verifiedBy')
  declare verifier: User;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'approved_by', type: DataType.INTEGER })
  declare approvedBy: number;

  @BelongsTo(() => User, 'approvedBy')
  declare approver: User;

  @AllowNull(true)
  @Column({ field: 'approved_at', type: DataType.DATE })
  declare approvedAt: Date;

  @AllowNull(true)
  @Column({ field: 'approval_remarks', type: DataType.TEXT })
  declare approvalRemarks: string;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;

  @HasMany(() => CargoDocument)
  declare documents: CargoDocument[];
}
