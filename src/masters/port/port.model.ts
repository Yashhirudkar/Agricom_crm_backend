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
  ForeignKey,
  BelongsTo,
  BelongsToMany,
  HasMany,
} from 'sequelize-typescript';
import { Country } from '../country/country.model';
import { ShippingLine } from '../shipping-line/shipping-line.model';

export enum PortType {
  SEA = 'SEA',
  AIR = 'AIR',
  ICD = 'ICD',
  DRY_PORT = 'DRY_PORT',
}

@Table({
  tableName: 'ports',
  timestamps: true,
  underscored: true,
})
export class Port extends Model<Port> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Country)
  @AllowNull(false)
  @Column({ field: 'country_id', type: DataType.INTEGER })
  declare countryId: number;

  @AllowNull(false)
  @Column({ field: 'port_name', type: DataType.STRING(150) })
  declare portName: string;

  @AllowNull(true)
  @Column({ field: 'port_code', type: DataType.STRING(50) })
  declare portCode: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare unlocode: string;

  @Default(PortType.SEA)
  @AllowNull(false)
  @Column({ field: 'port_type', type: DataType.STRING(50) })
  declare portType: PortType | string;

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

  @BelongsTo(() => Country, { foreignKey: 'countryId', as: 'country' })
  declare country: Country;

  @BelongsToMany(() => ShippingLine, () => PortShippingLine)
  declare shippingLines: ShippingLine[];

  @HasMany(() => PortShippingLine, { foreignKey: 'portId', as: 'shippingLineMappings' })
  declare shippingLineMappings: PortShippingLine[];

  // Compatibility getters
  get name(): string {
    return this.portName;
  }

  get code(): string {
    return this.portCode;
  }
}

@Table({
  tableName: 'port_shipping_lines',
  timestamps: true,
  underscored: true,
})
export class PortShippingLine extends Model<PortShippingLine> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Port)
  @AllowNull(false)
  @Column({ field: 'port_id', type: DataType.INTEGER })
  declare portId: number;

  @ForeignKey(() => ShippingLine)
  @AllowNull(false)
  @Column({ field: 'shipping_line_id', type: DataType.INTEGER })
  declare shippingLineId: number;

  @Default(true)
  @AllowNull(false)
  @Column({ field: 'is_active', type: DataType.BOOLEAN })
  declare isActive: boolean;

  @AllowNull(true)
  @Column({ type: DataType.STRING(255) })
  declare remarks: string;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;

  @BelongsTo(() => Port, { foreignKey: 'portId', as: 'port' })
  declare port: Port;

  @BelongsTo(() => ShippingLine, { foreignKey: 'shippingLineId', as: 'shippingLine' })
  declare shippingLine: ShippingLine;
}
