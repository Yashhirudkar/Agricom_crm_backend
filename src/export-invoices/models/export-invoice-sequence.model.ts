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
  Index,
} from 'sequelize-typescript';
import { Company } from '../../companies/models/company.model';

@Table({
  tableName: 'export_invoice_sequences',
  timestamps: true,
  indexes: [
    { fields: ['company_id', 'prefix'], unique: true },
  ],
})
export class ExportInvoiceSequence extends Model<ExportInvoiceSequence> {
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

  @Default('EXP')
  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare prefix: string;

  @Default(0)
  @AllowNull(false)
  @Column({ field: 'current_sequence', type: DataType.INTEGER })
  declare currentSequence: number;

  @Default(3)
  @AllowNull(false)
  @Column({ field: 'padding_length', type: DataType.INTEGER })
  declare paddingLength: number;

  @Default('{PREFIX}-{SEQ}-{CONTRACT}')
  @AllowNull(false)
  @Column({ field: 'format_pattern', type: DataType.STRING(100) })
  declare formatPattern: string;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}

