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
} from 'sequelize-typescript';

@Table({
  tableName: 'countries',
  timestamps: true,
  indexes: [{ fields: ['is_active'] }],
})
export class Country extends Model<Country> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @Unique
  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare name: string;

  @Unique
  @AllowNull(false)
  @Column({ field: 'iso2_code', type: DataType.STRING(2) })
  declare iso2Code: string;

  @Unique
  @AllowNull(false)
  @Column({ field: 'iso3_code', type: DataType.STRING(3) })
  declare iso3Code: string;

  @AllowNull(true)
  @Column({ field: 'phone_code', type: DataType.STRING(20) })
  declare phoneCode: string;

  @AllowNull(true)
  @Column({ field: 'currency_code', type: DataType.STRING(10) })
  declare currencyCode: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare region: string;

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
