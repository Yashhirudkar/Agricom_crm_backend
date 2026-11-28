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
import { StuffingExecutionGroup } from './stuffing-execution-group.model';
import { SalesContractShipment } from './sales-contract-shipment.model';
import { ShipmentStuffing } from './shipment-stuffing.model';

@Table({
  tableName: 'stuffing_execution_group_items',
  timestamps: true,
  indexes: [
    { fields: ['stuffing_group_id'] },
    { fields: ['shipment_id'], unique: true },
    { fields: ['shipment_stuffing_id'], unique: true },
  ],
})
export class StuffingExecutionGroupItem extends Model<StuffingExecutionGroupItem> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => StuffingExecutionGroup)
  @AllowNull(false)
  @Column({ field: 'stuffing_group_id', type: DataType.INTEGER })
  declare stuffingGroupId: number;

  @BelongsTo(() => StuffingExecutionGroup, 'stuffingGroupId')
  declare stuffingGroup: StuffingExecutionGroup;

  @ForeignKey(() => SalesContractShipment)
  @AllowNull(false)
  @Column({ field: 'shipment_id', type: DataType.INTEGER, unique: true })
  declare shipmentId: number;

  @BelongsTo(() => SalesContractShipment, 'shipmentId')
  declare shipment: SalesContractShipment;

  @ForeignKey(() => ShipmentStuffing)
  @AllowNull(false)
  @Column({
    field: 'shipment_stuffing_id',
    type: DataType.INTEGER,
    unique: true,
  })
  declare shipmentStuffingId: number;

  @BelongsTo(() => ShipmentStuffing, 'shipmentStuffingId')
  declare shipmentStuffing: ShipmentStuffing;

  @Default(1)
  @AllowNull(false)
  @Column({ field: 'sequence_order', type: DataType.INTEGER })
  declare sequenceOrder: number;

  @Default(0)
  @AllowNull(false)
  @Column({
    field: 'allocated_loading_weight',
    type: DataType.DECIMAL(12, 3),
  })
  declare allocatedLoadingWeight: number;

  @Default(0)
  @AllowNull(false)
  @Column({ field: 'allocated_gross_weight', type: DataType.DECIMAL(12, 3) })
  declare allocatedGrossWeight: number;

  @Default(0)
  @AllowNull(false)
  @Column({ field: 'allocated_net_weight', type: DataType.DECIMAL(12, 3) })
  declare allocatedNetWeight: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
