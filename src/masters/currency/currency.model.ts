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
  tableName: 'currencies',
  timestamps: true,
  indexes: [
    { name: 'currencies_status', fields: ['status'] },
    { name: 'currencies_is_active', fields: ['is_active'] },
    { name: 'currencies_code_unique', unique: true, fields: ['code'] },
    { name: 'idx_currencies_status_code', fields: ['status', 'code'] },
  ],
})
export class Currency extends Model<Currency> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @Unique('currencies_code_unique')
  @AllowNull(false)
  @Column({ type: DataType.STRING(10) })
  declare code: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare name: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(20) })
  declare symbol: string;

  @Default(true)
  @AllowNull(false)
  @Column({ field: 'is_active', type: DataType.BOOLEAN })
  declare isActive: boolean;

  @Default('Active')
  @AllowNull(false)
  @Column({ type: DataType.STRING(20) })
  declare status: string;

  @Default(0)
  @AllowNull(false)
  @Column({ field: 'sort_order', type: DataType.INTEGER })
  declare sortOrder: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
