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
import { Company } from '../../companies/models/company.model';
import { SalesContract } from './sales-contract.model';
import { SalesContractShipment } from './sales-contract-shipment.model';
import { User } from '../../users/models/user.model';
import { StuffingExecutionGroupItem } from './stuffing-execution-group-item.model';

@Table({
  tableName: 'stuffing_execution_groups',
  timestamps: true,
  indexes: [
    { fields: ['company_id'] },
    { fields: ['sales_contract_id'] },
    { fields: ['primary_shipment_id'] },
    { fields: ['stuffing_status'] },
  ],
})
export class StuffingExecutionGroup extends Model<StuffingExecutionGroup> {
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

  @ForeignKey(() => SalesContract)
  @AllowNull(false)
  @Column({ field: 'sales_contract_id', type: DataType.INTEGER })
  declare salesContractId: number;

  @BelongsTo(() => SalesContract)
  declare salesContract: SalesContract;

  @ForeignKey(() => SalesContractShipment)
  @AllowNull(true)
  @Column({ field: 'primary_shipment_id', type: DataType.INTEGER })
  declare primaryShipmentId: number | null;

  @BelongsTo(() => SalesContractShipment, 'primaryShipmentId')
  declare primaryShipment: SalesContractShipment;

  @AllowNull(true)
  @Column({ field: 'group_reference', type: DataType.STRING(100) })
  declare groupReference: string | null;

  @AllowNull(true)
  @Column({ field: 'transport_category', type: DataType.STRING(50) })
  declare transportCategory: string | null;

  @Default('Draft')
  @AllowNull(false)
  @Column({ field: 'stuffing_status', type: DataType.STRING(50) })
  declare stuffingStatus: string;

  @Default('Pending')
  @AllowNull(false)
  @Column({ field: 'execution_status', type: DataType.STRING(50) })
  declare executionStatus: string;

  @Default(0)
  @AllowNull(false)
  @Column({
    field: 'combined_actual_loading_weight',
    type: DataType.DECIMAL(12, 3),
  })
  declare combinedActualLoadingWeight: number;

  @Default(0)
  @AllowNull(false)
  @Column({ field: 'combined_gross_weight', type: DataType.DECIMAL(12, 3) })
  declare combinedGrossWeight: number;

  @Default(0)
  @AllowNull(false)
  @Column({ field: 'combined_net_weight', type: DataType.DECIMAL(12, 3) })
  declare combinedNetWeight: number;

  @AllowNull(true)
  @Column({ field: 'auto_populated_data', type: DataType.JSONB })
  declare autoPopulatedData: any;

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

  @HasMany(() => StuffingExecutionGroupItem, 'stuffingGroupId')
  declare items: StuffingExecutionGroupItem[];

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
