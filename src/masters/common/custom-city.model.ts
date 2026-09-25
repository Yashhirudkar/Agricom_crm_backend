import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';

@Table({
  tableName: 'custom_cities',
  timestamps: true,
  underscored: true,
  indexes: [{ fields: ['country_code', 'state_name'] }],
})
export class CustomCity extends Model<CustomCity> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @AllowNull(false)
  @Column({ field: 'country_code', type: DataType.STRING(10) })
  declare countryCode: string;

  @AllowNull(false)
  @Column({ field: 'country_name', type: DataType.STRING(150) })
  declare countryName: string;

  @AllowNull(false)
  @Column({ field: 'state_name', type: DataType.STRING(150) })
  declare stateName: string;

  @AllowNull(false)
  @Column({ field: 'city_name', type: DataType.STRING(150) })
  declare cityName: string;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
