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
} from 'sequelize-typescript';

@Table({
  tableName: 'hs_codes',
  timestamps: true,
  indexes: [{ fields: ['is_active'] }],
})
export class HSCode extends Model<HSCode> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @Index
  @Unique
  @AllowNull(false)
  @Column({ type: DataType.STRING(20) })
  declare code: string;

  @Index
  @AllowNull(false)
  @Column({ type: DataType.STRING(300) })
  declare description: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare chapter: string;

  @AllowNull(true)
  @Column({ field: 'sub_heading', type: DataType.STRING(100) })
  declare subHeading: string;

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
