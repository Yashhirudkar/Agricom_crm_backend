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
  Unique,
  HasMany,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { BagSpecification } from './bag-specification.model';
import { Company } from '../../../companies/models/company.model';

@Table({
  tableName: 'packing_types',
  timestamps: true,
  indexes: [{ fields: ['is_active'] }],
})
export class PackingType extends Model<PackingType> {
  @ForeignKey(() => Company)
  @AllowNull(true)
  @Column({ field: 'company_id', type: DataType.INTEGER })
  declare companyId: number;

  @BelongsTo(() => Company)
  declare company: Company;

  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @Unique
  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare name: string;

  @Default(true)
  @AllowNull(false)
  @Column({ field: 'is_active', type: DataType.BOOLEAN })
  declare isActive: boolean;

  @HasMany(() => BagSpecification)
  declare bagSpecifications: BagSpecification[];

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
