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
  Index,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { Category } from '../category/category.model';

@Table({
  tableName: 'products',
  timestamps: true,
  indexes: [
    { fields: ['name'] },
    { fields: ['category_id'] },
    { fields: ['country'] },
    { fields: ['hs_code'] },
    { fields: ['is_active'] },
  ],
})
export class Product extends Model<Product> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @AllowNull(false)
  @Column({ type: DataType.STRING(150) })
  declare name: string;

  @ForeignKey(() => Category)
  @AllowNull(false)
  @Column({ field: 'category_id', type: DataType.INTEGER })
  declare categoryId: number;

  @BelongsTo(() => Category)
  declare category: Category;

  @AllowNull(false)
  @Column({ field: 'country', type: DataType.STRING(150) })
  declare country: string;

  @AllowNull(true)
  @Column({ field: 'hs_code', type: DataType.STRING(100) })
  declare hsCode: string;

  @AllowNull(true)
  @Column({ field: 'quality_sub_type', type: DataType.STRING(100) })
  declare qualitySubType: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(1000) })
  declare specification: string;

  @AllowNull(true)
  @Column({ field: 'qty_20ft_container', type: DataType.DECIMAL(10, 2) })
  declare qty20ftContainer: number;

  @AllowNull(true)
  @Column({ field: 'qty_40ft_container', type: DataType.DECIMAL(10, 2) })
  declare qty40ftContainer: number;

  @AllowNull(true)
  @Column({ field: 'qty_40hc_container', type: DataType.DECIMAL(10, 2) })
  declare qty40hcContainer: number;

  @AllowNull(true)
  @Column({ field: 'truck_capacity', type: DataType.DECIMAL(10, 2) })
  declare truckCapacity: number;

  @AllowNull(true)
  @Column({ field: 'wagon_capacity', type: DataType.DECIMAL(10, 2) })
  declare wagonCapacity: number;

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
