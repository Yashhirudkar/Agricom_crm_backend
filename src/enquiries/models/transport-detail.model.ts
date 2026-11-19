import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AllowNull,
  Default,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
  BelongsTo,
  BeforeCreate,
  BeforeUpdate,
} from 'sequelize-typescript';
import { Enquiry } from './enquiry.model';
import { Company } from '../../companies/models/company.model';
import { SalesContract } from '../../sales-contracts/models/sales-contract.model';

@Table({
  tableName: 'transport_details',
  timestamps: true,
  indexes: [
    { fields: ['enquiry_id'] },
    { fields: ['sales_contract_id'] },
    { fields: ['parent_id'] },
    { fields: ['company_id'] },
  ],
})
export class TransportDetail extends Model<TransportDetail> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID })
  declare id: string;

  @ForeignKey(() => Company)
  @AllowNull(true)
  @Column({ field: 'company_id', type: DataType.INTEGER })
  declare companyId: number | null;

  @BelongsTo(() => Company)
  declare company: Company;

  @ForeignKey(() => Enquiry)
  @AllowNull(true)
  @Column({ field: 'enquiry_id', type: DataType.UUID })
  declare enquiryId: string | null;

  @BelongsTo(() => Enquiry, { foreignKey: 'enquiryId', onDelete: 'CASCADE' })
  declare enquiry: Enquiry;

  @ForeignKey(() => SalesContract)
  @AllowNull(true)
  @Column({ field: 'sales_contract_id', type: DataType.INTEGER })
  declare salesContractId: number | null;

  @BelongsTo(() => SalesContract, {
    foreignKey: 'salesContractId',
    onDelete: 'CASCADE',
  })
  declare salesContract: SalesContract;

  @AllowNull(true)
  @Column({ field: 'parent_id', type: DataType.STRING(100) })
  declare parentId: string | null;

  @AllowNull(false)
  @Default(1)
  @Column({ field: 'sequence', type: DataType.INTEGER })
  declare sequence: number;

  @AllowNull(false)
  @Column({ field: 'origin', type: DataType.STRING(255) })
  declare origin: string;

  @AllowNull(false)
  @Column({ field: 'incoterm', type: DataType.STRING(100) })
  declare incoterm: string;

  @AllowNull(false)
  @Column({ field: 'destination', type: DataType.STRING(255) })
  declare destination: string;

  @AllowNull(false)
  @Default(false)
  @Column({ field: 'freight_required', type: DataType.BOOLEAN })
  declare freightRequired: boolean;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;

  @BeforeCreate
  @BeforeUpdate
  static autoCompute(instance: TransportDetail) {
    if (!instance.parentId) {
      instance.parentId =
        instance.enquiryId ||
        (instance.salesContractId ? String(instance.salesContractId) : null);
    }
  }
}
