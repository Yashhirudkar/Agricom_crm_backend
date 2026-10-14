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
  BelongsToMany,
  HasMany,
} from 'sequelize-typescript';
import { Port, PortShippingLine } from '../port/port.model';

@Table({
  tableName: 'shipping_lines',
  timestamps: true,
  underscored: true,
})
export class ShippingLine extends Model<ShippingLine> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @Unique
  @AllowNull(false)
  @Column({ field: 'line_name', type: DataType.STRING(150) })
  declare lineName: string;

  @AllowNull(true)
  @Column({ field: 'line_code', type: DataType.STRING(50) })
  declare lineCode: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(255) })
  declare website: string;

  @AllowNull(true)
  @Column({ field: 'contact_email', type: DataType.STRING(150) })
  declare contactEmail: string;

  @AllowNull(true)
  @Column({ field: 'contact_phone', type: DataType.STRING(50) })
  declare contactPhone: string;

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

  @BelongsToMany(() => Port, () => PortShippingLine)
  declare ports: Port[];

  @HasMany(() => PortShippingLine, { foreignKey: 'shippingLineId', as: 'portMappings' })
  declare portMappings: PortShippingLine[];

  // Alias getters
  get name(): string {
    return this.lineName;
  }

  get code(): string {
    return this.lineCode;
  }
}
