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
import { CargoAvailability } from './cargo-availability.model';
import { Partner } from '../../masters/partner/partner.model';
import { User } from '../../users/models/user.model';

@Table({
  tableName: 'cargo_readiness',
  timestamps: true,
  indexes: [
    { fields: ['cargo_availability_id'] },
    { fields: ['status'] },
    { fields: ['ready_date'] },
  ],
})
export class CargoReadiness extends Model<CargoReadiness> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => CargoAvailability)
  @AllowNull(false)
  @Column({ field: 'cargo_availability_id', type: DataType.INTEGER })
  declare cargoAvailabilityId: number;

  @BelongsTo(() => CargoAvailability)
  declare cargoAvailability: CargoAvailability;

  @ForeignKey(() => Partner)
  @AllowNull(true)
  @Column({ field: 'warehouse_id', type: DataType.INTEGER })
  declare warehouseId: number;

  @BelongsTo(() => Partner, 'warehouseId')
  declare warehouse: Partner;

  @AllowNull(true)
  @Column({ field: 'warehouse_name', type: DataType.STRING(255) })
  declare warehouseName: string;

  @AllowNull(false)
  @Column({ field: 'ready_date', type: DataType.DATEONLY })
  declare readyDate: string;

  @Default(0)
  @AllowNull(false)
  @Column({ field: 'ready_qty', type: DataType.DECIMAL(12, 2) })
  declare readyQty: number;

  @Default('Bag')
  @AllowNull(false)
  @Column({ field: 'bag_bulk', type: DataType.STRING(50) })
  declare bagBulk: string;

  @Default('MT')
  @AllowNull(false)
  @Column({ type: DataType.STRING(30) })
  declare uom: string;

  @AllowNull(true)
  @Column({ field: 'lot_number', type: DataType.STRING(100) })
  declare lotNumber: string;

  @AllowNull(true)
  @Column({ field: 'batch_number', type: DataType.STRING(100) })
  declare batchNumber: string;

  @AllowNull(true)
  @Column({ field: 'stack_number', type: DataType.STRING(100) })
  declare stackNumber: string;

  @AllowNull(true)
  @Column({ field: 'storage_location', type: DataType.STRING(255) })
  declare storageLocation: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare moisture: string;

  @AllowNull(true)
  @Column({ field: 'foreign_matter', type: DataType.STRING(50) })
  declare foreignMatter: string;

  @AllowNull(true)
  @Column({ field: 'quality_grade', type: DataType.STRING(100) })
  declare qualityGrade: string;

  @AllowNull(true)
  @Column({ field: 'inspection_status', type: DataType.STRING(100) })
  declare inspectionStatus: string;

  @AllowNull(true)
  @Column({ field: 'qc_remarks', type: DataType.TEXT })
  declare qcRemarks: string;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare remarks: string;

  @AllowNull(true)
  @Column({ field: 'internal_notes', type: DataType.TEXT })
  declare internalNotes: string;

  @Default('Draft')
  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare status: string;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'created_by', type: DataType.INTEGER })
  declare createdBy: number;

  @BelongsTo(() => User, 'createdBy')
  declare creator: User;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'approved_by', type: DataType.INTEGER })
  declare approvedBy: number;

  @BelongsTo(() => User, 'approvedBy')
  declare approver: User;

  @AllowNull(true)
  @Column({ field: 'approved_at', type: DataType.DATE })
  declare approvedAt: Date;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
