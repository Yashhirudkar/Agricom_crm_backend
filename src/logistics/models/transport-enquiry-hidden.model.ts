import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  ForeignKey,
  CreatedAt,
  Index,
} from 'sequelize-typescript';
import { User } from '../../users/models/user.model';
import { Company } from '../../companies/models/company.model';
import { Enquiry } from '../../enquiries/models/enquiry.model';

@Table({
  tableName: 'transport_enquiry_hides',
  timestamps: true,
  updatedAt: false,
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'company_id', 'enquiry_id'],
    },
  ],
})
export class TransportEnquiryHidden extends Model<TransportEnquiryHidden> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column({ field: 'user_id', type: DataType.INTEGER })
  declare userId: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index
  @Column({ field: 'company_id', type: DataType.INTEGER })
  declare companyId: number;

  @ForeignKey(() => Enquiry)
  @AllowNull(false)
  @Index
  @Column({ field: 'enquiry_id', type: DataType.UUID })
  declare enquiryId: string;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
