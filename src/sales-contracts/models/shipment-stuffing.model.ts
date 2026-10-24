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
import { SalesContractShipment } from './sales-contract-shipment.model';
import { SalesContract } from './sales-contract.model';
import { Company } from '../../companies/models/company.model';
import { User } from '../../users/models/user.model';

@Table({
  tableName: 'shipment_stuffings',
  timestamps: true,
  indexes: [{ fields: ['shipment_id'], unique: true }, { fields: ['company_id'] }],
})
export class ShipmentStuffing extends Model<ShipmentStuffing> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Company)
  @AllowNull(true)
  @Column({ field: 'company_id', type: DataType.INTEGER })
  declare companyId: number | null;

  @BelongsTo(() => Company)
  declare company: Company;

  @ForeignKey(() => SalesContractShipment)
  @AllowNull(false)
  @Column({ field: 'shipment_id', type: DataType.INTEGER, unique: true })
  declare shipmentId: number;

  @BelongsTo(() => SalesContractShipment)
  declare shipment: SalesContractShipment;

  @ForeignKey(() => SalesContract)
  @AllowNull(true)
  @Column({ field: 'sales_contract_id', type: DataType.INTEGER })
  declare salesContractId: number | null;

  @BelongsTo(() => SalesContract)
  declare salesContract: SalesContract;

  @Default('Draft')
  @AllowNull(false)
  @Column({ field: 'stuffing_status', type: DataType.STRING(50) })
  declare stuffingStatus: string; // 'Draft' | 'Completed'

  @Default('Draft')
  @AllowNull(false)
  @Column({ field: 'execution_status', type: DataType.STRING(50) })
  declare executionStatus: string; // 'Draft' | 'Stuffed'

  // Snapshot of 80-90% auto-populated data from all modules
  @AllowNull(true)
  @Column({ field: 'auto_populated_data', type: DataType.JSONB })
  declare autoPopulatedData: any;

  // Stuffing Information
  @AllowNull(true)
  @Column({ field: 'stuffing_date', type: DataType.DATEONLY })
  declare stuffingDate: string;

  @AllowNull(true)
  @Column({ field: 'stuffing_start_time', type: DataType.STRING(50) })
  declare stuffingStartTime: string;

  @AllowNull(true)
  @Column({ field: 'stuffing_end_time', type: DataType.STRING(50) })
  declare stuffingEndTime: string;

  @AllowNull(true)
  @Column({ field: 'stuffing_location', type: DataType.STRING(255) })
  declare stuffingLocation: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(255) })
  declare supervisor: string;

  // Loading Information
  @AllowNull(true)
  @Column({ field: 'loading_date', type: DataType.DATEONLY })
  declare loadingDate: string;

  @Default(0)
  @AllowNull(true)
  @Column({ field: 'actual_loading_weight', type: DataType.DECIMAL(12, 2) })
  declare actualLoadingWeight: number;

  @Default(0)
  @AllowNull(true)
  @Column({ field: 'gross_weight', type: DataType.DECIMAL(12, 2) })
  declare grossWeight: number;

  @Default(0)
  @AllowNull(true)
  @Column({ field: 'net_weight', type: DataType.DECIMAL(12, 2) })
  declare netWeight: number;

  // Editable Freight details if not available from logistics
  @AllowNull(true)
  @Column({ field: 'freight_overrides', type: DataType.JSONB })
  declare freightOverrides: any;

  // Dynamic Containers
  @Default([])
  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare containers: Array<{
    containerNo: string;
    sealNo: string;
    tareWeight?: number;
    grossWeight?: number;
    netWeight?: number;
  }>;

  // Dynamic Trucks
  @Default([])
  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare trucks: Array<{
    truckNo: string;
    driver: string;
    transporter: string;
  }>;

  // Dynamic Attachments
  @Default([])
  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare attachments: Array<{
    id?: string | number;
    documentName: string;
    tradeDocumentId?: number | null;
    fileName?: string;
    fileUrl?: string;
    fileSize?: number;
    mimeType?: string;
    remarks?: string;
    uploadedAt?: string | Date;
  }>;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare remarks: string;

  @AllowNull(true)
  @Column({ field: 'completed_at', type: DataType.DATE })
  declare completedAt: Date | null;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'created_by', type: DataType.INTEGER })
  declare createdBy: number | null;

  @BelongsTo(() => User, 'createdBy')
  declare creatorUser: User;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'updated_by', type: DataType.INTEGER })
  declare updatedBy: number | null;

  @BelongsTo(() => User, 'updatedBy')
  declare updaterUser: User;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
