// Logistics & Freight Header Model
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
  HasMany,
} from 'sequelize-typescript';
import { Enquiry } from '../../enquiries/models/enquiry.model';
import { FreightQuote } from './freight-quote.model';
import { SalesContractShipment } from '../../sales-contracts/models/sales-contract-shipment.model';

@Table({
  tableName: 'logistics',
  timestamps: true,
  paranoid: true,
})
export class Logistics extends Model<Logistics> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @AllowNull(false)
  @Column({ field: 'logistics_number', type: DataType.STRING(50) })
  declare logisticsNumber: string;

  @ForeignKey(() => Enquiry)
  @AllowNull(false)
  @Column({ field: 'enquiry_id', type: DataType.UUID })
  declare enquiryId: string;

  @BelongsTo(() => Enquiry)
  declare enquiry: Enquiry;

  @AllowNull(false)
  @Default('Domestic')
  @Column({ type: DataType.STRING(50) })
  declare mode: string;

  @AllowNull(false)
  @Default('Road')
  @Column({ field: 'transport_mode', type: DataType.STRING(50) })
  declare transportMode: string;

  @AllowNull(false)
  @Default('Pending')
  @Column({ type: DataType.STRING(50) })
  declare status: string;

  @ForeignKey(() => FreightQuote)
  @AllowNull(true)
  @Column({ field: 'selected_freight_id', type: DataType.INTEGER })
  declare selectedFreightId: number;

  @BelongsTo(() => FreightQuote, { foreignKey: 'selectedFreightId', constraints: false })
  declare selectedFreight: FreightQuote;

  @AllowNull(true)
  @Column({ field: 'estimated_dispatch_date', type: DataType.DATEONLY })
  declare estimatedDispatchDate: Date;

  @AllowNull(true)
  @Column({ field: 'estimated_arrival_date', type: DataType.DATEONLY })
  declare estimatedArrivalDate: Date;

  @AllowNull(true)
  @Column({ field: 'actual_dispatch_date', type: DataType.DATEONLY })
  declare actualDispatchDate: Date;

  @AllowNull(true)
  @Column({ field: 'actual_arrival_date', type: DataType.DATEONLY })
  declare actualArrivalDate: Date;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare remarks: string;

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

  @HasMany(() => FreightQuote)
  declare quotes: FreightQuote[];

  @HasMany(() => SalesContractShipment)
  declare shipments: SalesContractShipment[];
}
