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
  HasMany,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { Company } from '../../companies/models/company.model';
import { NostroBank } from './nostro-bank.model';
import { CurrencyAccount } from './currency-account.model';

@Table({
  tableName: 'domestic_banks',
  timestamps: true,
  indexes: [
    { fields: ['company_id'] },
    { fields: ['currency'] },
    { fields: ['status'] },
  ],
})
export class DomesticBank extends Model<DomesticBank> {
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

  @AllowNull(false)
  @Column({ field: 'bank_name', type: DataType.STRING(255) })
  declare bankName: string;

  @AllowNull(false)
  @Default('INR')
  @Column({ type: DataType.STRING(10) })
  declare currency: string;

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

  @HasMany(() => NostroBank, {
    foreignKey: 'domesticBankId',
    as: 'nostroAccounts',
    onDelete: 'CASCADE',
  })
  declare nostroAccounts: NostroBank[];

  @HasMany(() => CurrencyAccount, {
    foreignKey: 'domesticBankId',
    as: 'currencyAccounts',
    onDelete: 'CASCADE',
  })
  declare currencyAccounts: CurrencyAccount[];

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
