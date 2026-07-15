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
import { TradeDocument } from '../../masters/trade-document/trade-document.model';

@Table({
  tableName: 'sales_contract_documents',
  timestamps: true,
})
export class SalesContractDocument extends Model<SalesContractDocument> {
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

  @ForeignKey(() => TradeDocument)
  @AllowNull(false)
  @Column({ field: 'trade_document_id', type: DataType.INTEGER })
  declare tradeDocumentId: number;

  @BelongsTo(() => TradeDocument)
  declare tradeDocument: TradeDocument;

  @Default(false)
  @AllowNull(false)
  @Column({ field: 'is_mandatory', type: DataType.BOOLEAN })
  declare isMandatory: boolean;

  @AllowNull(true)
  @Column({ type: DataType.STRING(500) })
  declare remarks: string;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
