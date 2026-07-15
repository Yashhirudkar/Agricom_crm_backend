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
} from 'sequelize-typescript';

@Table({
  tableName: 'financial_years',
  timestamps: true,
  indexes: [{ fields: ['status'] }, { fields: ['is_current'] }],
})
export class FinancialYear extends Model<FinancialYear> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @Unique
  @AllowNull(false)
  @Column({ type: DataType.STRING(20) })
  declare year: string;

  @AllowNull(false)
  @Column({ field: 'display_name', type: DataType.STRING(100) })
  declare displayName: string;

  @Default(false)
  @AllowNull(false)
  @Column({ field: 'is_current', type: DataType.BOOLEAN })
  declare isCurrent: boolean;

  @Default('Active')
  @AllowNull(false)
  @Column({ type: DataType.STRING(20) })
  declare status: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(500) })
  declare remarks: string;

  @AllowNull(true)
  @Column({ field: 'created_by', type: DataType.INTEGER })
  declare createdBy: number;

  @AllowNull(true)
  @Column({ field: 'updated_by', type: DataType.INTEGER })
  declare updatedBy: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
