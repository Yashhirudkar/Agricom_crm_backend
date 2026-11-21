import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Default,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { Company } from '../../companies/models/company.model';
import { DomesticBank } from './domestic-bank.model';

@Table({
  tableName: 'nostro_banks',
  timestamps: true,
  indexes: [
    { fields: ['company_id'] },
    { fields: ['domestic_bank_id'] },
    { fields: ['currency'] },
    { fields: ['status'] },
  ],
})
export class NostroBank extends Model<NostroBank> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column({ field: 'company_id', type: DataType.INTEGER })
  declare companyId: number;

  @BelongsTo(() => Company, { onDelete: 'CASCADE' })
  declare company: Company;

  @ForeignKey(() => DomesticBank)
  @AllowNull(false)
  @Column({ field: 'domestic_bank_id', type: DataType.INTEGER })
  declare domesticBankId: number;

  @BelongsTo(() => DomesticBank, { foreignKey: 'domesticBankId', as: 'domesticBank', onDelete: 'CASCADE' })
  declare domesticBank: DomesticBank;

  @AllowNull(false)
  @Column({ type: DataType.STRING(10) })
  declare currency: string;

  @AllowNull(false)
  @Column({ field: 'bank_name', type: DataType.STRING(255) })
  declare bankName: string;

  @AllowNull(false)
  @Column({ field: 'account_name', type: DataType.STRING(255) })
  declare accountName: string;

  @AllowNull(false)
  @Column({ field: 'account_number', type: DataType.STRING(100) })
  declare accountNumber: string;

  @AllowNull(false)
  @Column({ field: 'swift_code', type: DataType.STRING(50) })
  declare swiftCode: string;

  @AllowNull(false)
  @Column({ field: 'bank_address', type: DataType.TEXT })
  declare bankAddress: string;

  @AllowNull(false)
  @Default('Active')
  @Column({ type: DataType.STRING(20) })
  declare status: 'Active' | 'Inactive';

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
