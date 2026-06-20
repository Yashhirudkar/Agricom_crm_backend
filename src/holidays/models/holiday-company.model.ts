import { Index, Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  PrimaryKey,
  AutoIncrement,
  AllowNull, } from 'sequelize-typescript';
import { Holiday } from './holiday.model';
import { Company } from '../../companies/models/company.model';

@Table({
  tableName: 'holiday_companies',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['holidayId', 'companyId'],
    },
  ],
})
export class HolidayCompany extends Model<HolidayCompany> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Holiday)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare holidayId: number;

  @BelongsTo(() => Holiday)
  declare holiday: Holiday;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare companyId: number;

  @BelongsTo(() => Company)
  declare company: Company;
}
