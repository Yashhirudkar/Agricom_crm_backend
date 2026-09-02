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
  tableName: 'equipment_options',
  timestamps: true,
  indexes: [{ fields: ['category'] }, { fields: ['is_active'] }],
})
export class EquipmentOption extends Model<EquipmentOption> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare category: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare value: string;

  @Default(0)
  @AllowNull(false)
  @Column({ field: 'display_order', type: DataType.INTEGER })
  declare displayOrder: number;

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
