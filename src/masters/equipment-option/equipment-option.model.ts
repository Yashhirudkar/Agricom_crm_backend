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
  BeforeSave,
} from 'sequelize-typescript';
import { Company } from '../../companies/models/company.model';
import { normalizeTruckCapacity } from '../../common/utils/truck-capacity.util';

@Table({
  tableName: 'equipment_options',
  timestamps: true,
  indexes: [{ fields: ['category'] }, { fields: ['is_active'] }],
})
export class EquipmentOption extends Model<EquipmentOption> {
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

  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare category: string;

  @AllowNull(false)
  @Column({
    type: DataType.STRING(100),
    get() {
      const val = this.getDataValue('value');
      const category = this.getDataValue('category');
      if (category === 'TRUCK_CAPACITY') {
        return normalizeTruckCapacity(val);
      }
      return val;
    },
    set(val: string) {
      const category = this.getDataValue('category');
      if (category === 'TRUCK_CAPACITY') {
        this.setDataValue('value', normalizeTruckCapacity(val));
      } else {
        this.setDataValue('value', val?.trim?.() ?? val);
      }
    },
  })
  declare value: string;

  @BeforeSave
  static normalizeOptionValue(instance: EquipmentOption) {
    if (instance.category?.toUpperCase() === 'TRUCK_CAPACITY') {
      instance.value = normalizeTruckCapacity(instance.value);
    } else if (instance.value) {
      instance.value = instance.value.trim();
    }
  }

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
