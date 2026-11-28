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
import { ExportInvoice } from './export-invoice.model';
import { StuffingExecutionGroup } from '../../sales-contracts/models/stuffing-execution-group.model';

@Table({
  tableName: 'export_invoice_stuffing_groups',
  timestamps: true,
  indexes: [
    { fields: ['export_invoice_id'], unique: true },
    { fields: ['stuffing_group_id'] },
  ],
})
export class ExportInvoiceStuffingGroup extends Model<ExportInvoiceStuffingGroup> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => ExportInvoice)
  @AllowNull(false)
  @Column({ field: 'export_invoice_id', type: DataType.INTEGER, unique: true })
  declare exportInvoiceId: number;

  @BelongsTo(() => ExportInvoice, 'exportInvoiceId')
  declare exportInvoice: ExportInvoice;

  @ForeignKey(() => StuffingExecutionGroup)
  @AllowNull(true)
  @Column({ field: 'stuffing_group_id', type: DataType.INTEGER })
  declare stuffingGroupId: number | null;

  @BelongsTo(() => StuffingExecutionGroup, 'stuffingGroupId')
  declare stuffingGroup: StuffingExecutionGroup;

  @Default([])
  @AllowNull(false)
  @Column({ field: 'shipment_ids', type: DataType.JSONB })
  declare shipmentIds: number[];

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
