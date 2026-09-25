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
import { SalesContractShipment } from '../../sales-contracts/models/sales-contract-shipment.model';
import { User } from '../../users/models/user.model';

@Table({
  tableName: 'cargo_shipment_allocations',
  timestamps: true,
  indexes: [
    { fields: ['cargo_availability_id'] },
    { fields: ['shipment_id'] },
  ],
})
export class CargoShipmentAllocation extends Model<CargoShipmentAllocation> {
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

  @ForeignKey(() => SalesContractShipment)
  @AllowNull(false)
  @Column({ field: 'shipment_id', type: DataType.INTEGER })
  declare shipmentId: number;

  @BelongsTo(() => SalesContractShipment)
  declare shipment: SalesContractShipment;

  @Default(0)
  @AllowNull(false)
  @Column({ field: 'allocated_qty', type: DataType.DECIMAL(12, 2) })
  declare allocatedQty: number;

  @Default('Active')
  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare status: string;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'allocated_by', type: DataType.INTEGER })
  declare allocatedBy: number;

  @BelongsTo(() => User, 'allocatedBy')
  declare allocator: User;

  @AllowNull(true)
  @Column({ field: 'allocated_at', type: DataType.DATE })
  declare allocatedAt: Date;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
