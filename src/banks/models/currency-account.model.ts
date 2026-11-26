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
  tableName: 'currency_accounts',
  timestamps: true,
  indexes: [
    { fields: ['company_id'] },
    { fields: ['domestic_bank_id'] },
    { fields: ['currency'] },
    { fields: ['status'] },
  ],
})
export class CurrencyAccount extends Model<CurrencyAccount> {
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

  @BelongsTo(() => DomesticBank, {
    foreignKey: 'domesticBankId',
    as: 'domesticBank',
    onDelete: 'CASCADE',
  })
  declare domesticBank: DomesticBank;

  @AllowNull(false)
  @Column({ type: DataType.STRING(10) })
  declare currency: string;

  @AllowNull(true)
  @Column({ field: 'account_name', type: DataType.STRING(255) })
  declare accountName: string | null;

  @AllowNull(false)
  @Column({ field: 'account_number', type: DataType.STRING(100) })
  declare accountNumber: string;

  @AllowNull(true)
  @Column({ field: 'swift_code', type: DataType.STRING(50) })
  declare swiftCode: string | null;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare iban: string | null;

  @AllowNull(true)
  @Column({ field: 'branch_name', type: DataType.STRING(255) })
  declare branchName: string | null;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare address: string | null;

  @AllowNull(false)
  @Default('Active')
  @Column({ type: DataType.STRING(20) })
  declare status: 'Active' | 'Inactive';

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare remarks: string | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
