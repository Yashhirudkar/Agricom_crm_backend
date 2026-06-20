import { Table, Column, Model, DataType, PrimaryKey, AutoIncrement, AllowNull, Default, CreatedAt, UpdatedAt, Unique, Index } from 'sequelize-typescript';

@Table({
  tableName: 'partner_roles',
  timestamps: true,
  indexes: [{ fields: ['is_active'] }]
})
export class PartnerRole extends Model<PartnerRole> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @Index
  @Unique
  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare name: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(500) })
  declare description: string;

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
