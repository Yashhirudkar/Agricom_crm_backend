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
} from 'sequelize-typescript';

@Table({
  tableName: 'freight_charge_master',
  timestamps: true,
})
export class FreightChargeMaster extends Model<FreightChargeMaster> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare mode: string;

  @AllowNull(false)
  @Column({ field: 'charge_name', type: DataType.STRING(150) })
  declare chargeName: string;

  @AllowNull(false)
  @Column({ field: 'charge_code', type: DataType.STRING(50) })
  declare chargeCode: string;

  @AllowNull(false)
  @Default(0)
  @Column({ field: 'display_order', type: DataType.INTEGER })
  declare displayOrder: number;

  @AllowNull(false)
  @Default(false)
  @Column({ field: 'is_default', type: DataType.BOOLEAN })
  declare isDefault: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ field: 'is_active', type: DataType.BOOLEAN })
  declare isActive: boolean;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
