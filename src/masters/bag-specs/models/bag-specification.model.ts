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
  HasMany,
} from 'sequelize-typescript';
import { BagType } from './bag-type.model';
import { PackingType } from './packing-type.model';
import { ProductBagAssignment } from './product-bag-assignment.model';

@Table({
  tableName: 'bag_specifications',
  timestamps: true,
  indexes: [
    { fields: ['bag_type_id'] },
    { fields: ['packing_type_id'] },
    { fields: ['is_active'] },
  ],
})
export class BagSpecification extends Model<BagSpecification> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => BagType)
  @AllowNull(false)
  @Column({ field: 'bag_type_id', type: DataType.INTEGER })
  declare bagTypeId: number;

  @BelongsTo(() => BagType)
  declare bagType: BagType;

  @ForeignKey(() => PackingType)
  @AllowNull(true)
  @Column({ field: 'packing_type_id', type: DataType.INTEGER })
  declare packingTypeId: number;

  @BelongsTo(() => PackingType)
  declare packingType: PackingType;

  @AllowNull(true)
  @Column({ type: DataType.DECIMAL(10, 2) })
  declare width: number;

  @AllowNull(true)
  @Column({ type: DataType.DECIMAL(10, 2) })
  declare length: number;

  @AllowNull(true)
  @Column({ field: 'empty_bag_weight', type: DataType.DECIMAL(10, 2) })
  declare emptyBagWeight: number;

  @AllowNull(true)
  @Column({ type: DataType.DECIMAL(10, 2) })
  declare cost: number;

  @Default(true)
  @AllowNull(false)
  @Column({ field: 'is_active', type: DataType.BOOLEAN })
  declare isActive: boolean;

  @HasMany(() => ProductBagAssignment)
  declare productAssignments: ProductBagAssignment[];

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
