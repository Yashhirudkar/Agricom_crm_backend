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
import { SalesContract } from './sales-contract.model';

@Table({
  tableName: 'sales_contract_shipments',
  timestamps: true,
})
export class SalesContractShipment extends Model<SalesContractShipment> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => SalesContract)
  @AllowNull(false)
  @Column({ field: 'sales_contract_id', type: DataType.INTEGER })
  declare salesContractId: number;

  @BelongsTo(() => SalesContract)
  declare salesContract: SalesContract;

  @AllowNull(false)
  @Column({ field: 'shipment_date', type: DataType.DATEONLY })
  declare shipmentDate: Date;

  @Default(0)
  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(12, 2) })
  declare quantity: number;

  @AllowNull(true)
  @Column({ field: 'no_of_containers', type: DataType.INTEGER })
  declare noOfContainers: number;

  @AllowNull(true)
  @Column({ field: 'rate_per_mt', type: DataType.DECIMAL(12, 2) })
  declare ratePerMt: number;

  @AllowNull(true)
  @Column({ field: 'purchase_rate', type: DataType.DECIMAL(12, 2) })
  declare purchaseRate: number;

  @AllowNull(true)
  @Column({ field: 'forex', type: DataType.DECIMAL(12, 2) })
  declare forex: number;

  @AllowNull(true)
  @Column({ field: 'freight', type: DataType.DECIMAL(12, 2) })
  declare freight: number;

  @AllowNull(true)
  @Column({ type: DataType.STRING(500) })
  declare remarks: string;

  @AllowNull(true)
  @Column({ field: 'shipment_reference', type: DataType.STRING(100) })
  declare shipmentReference: string;

  @AllowNull(false)
  @Default(1)
  @Column({ field: 'shipment_no', type: DataType.INTEGER })
  declare shipmentNo: number;

  @AllowNull(false)
  @Default('Scheduled')
  @Column({ type: DataType.STRING(50) })
  declare status: string;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
