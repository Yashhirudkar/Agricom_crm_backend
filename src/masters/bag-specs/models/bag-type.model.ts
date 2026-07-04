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
  HasMany,
} from 'sequelize-typescript';
import { BagSpecification } from './bag-specification.model';

@Table({
  tableName: 'bag_types',
  timestamps: true,
  indexes: [{ fields: ['is_active'] }],
})
export class BagType extends Model<BagType> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @Unique
  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare name: string;

  @Default(true)
  @AllowNull(false)
  @Column({ field: 'is_active', type: DataType.BOOLEAN })
  declare isActive: boolean;

  @HasMany(() => BagSpecification)
  declare bagSpecifications: BagSpecification[];

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
