import { Table, Column, Model, DataType, PrimaryKey, AutoIncrement, AllowNull, Default, CreatedAt, UpdatedAt, Index, ForeignKey, BelongsTo, HasMany, BelongsToMany } from 'sequelize-typescript';
import { PartnerRole } from '../partner-role/partner-role.model';
import { Country } from '../country/country.model';
import { PartnerContact } from './partner-contact.model';
import { Product } from '../product/product.model';
import { PartnerProduct } from './partner-product.model';

@Table({
  tableName: 'partners',
  timestamps: true,
  indexes: [
    { fields: ['entity_name'] },
    { fields: ['partner_role_id'] },
    { fields: ['country_id'] },
    { fields: ['is_active'] },
  ]
})
export class Partner extends Model<Partner> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @AllowNull(false)
  @Column({ field: 'entity_name', type: DataType.STRING(200) })
  declare entityName: string;

  @ForeignKey(() => PartnerRole)
  @AllowNull(false)
  @Column({ field: 'partner_role_id', type: DataType.INTEGER })
  declare partnerRoleId: number;

  @BelongsTo(() => PartnerRole)
  declare partnerRole: PartnerRole;

  @ForeignKey(() => Country)
  @AllowNull(false)
  @Column({ field: 'country_id', type: DataType.INTEGER })
  declare countryId: number;

  @BelongsTo(() => Country)
  declare country: Country;

  @HasMany(() => PartnerContact)
  declare contacts: PartnerContact[];

  @BelongsToMany(() => Product, () => PartnerProduct)
  declare products: Product[];

  @AllowNull(true)
  @Column({ type: DataType.STRING(1000) })
  declare address: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare city: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(300) })
  declare website: string;

  @AllowNull(true)
  @Column({ field: 'contact_email', type: DataType.STRING(255) })
  declare contactEmail: string;

  @AllowNull(true)
  @Column({ field: 'tax_id', type: DataType.STRING(50) })
  declare taxId: string;

  @AllowNull(true)
  @Column({ field: 'pan_no', type: DataType.STRING(50) })
  declare panNo: string;

  @AllowNull(true)
  @Column({ field: 'inn_no', type: DataType.STRING(50) })
  declare innNo: string;

  @AllowNull(true)
  @Column({ field: 'financial_status', type: DataType.STRING(100) })
  declare financialStatus: string;

  @Default(true)
  @AllowNull(false)
  @Column({ field: 'is_active', type: DataType.BOOLEAN })
  declare isActive: boolean;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
