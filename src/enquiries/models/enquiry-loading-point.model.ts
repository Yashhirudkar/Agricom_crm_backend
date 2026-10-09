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
} from 'sequelize-typescript';
import { Enquiry } from './enquiry.model';
import { Company } from '../../companies/models/company.model';

@Table({
  tableName: 'enquiry_loading_points',
  timestamps: true,
  indexes: [{ fields: ['enquiry_id'] }, { fields: ['company_id'] }],
})
export class EnquiryLoadingPoint extends Model<EnquiryLoadingPoint> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID })
  declare id: string;

  @ForeignKey(() => Company)
  @AllowNull(true)
  @Column({ field: 'company_id', type: DataType.INTEGER })
  declare companyId: number;

  @BelongsTo(() => Company)
  declare company: Company;

  @ForeignKey(() => Enquiry)
  @AllowNull(false)
  @Column({ field: 'enquiry_id', type: DataType.UUID })
  declare enquiryId: string;

  @BelongsTo(() => Enquiry)
  declare enquiry: Enquiry;

  @AllowNull(false)
  @Column({ field: 'loading_point', type: DataType.STRING(500) })
  declare loadingPoint: string;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
