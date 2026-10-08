import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  DeletedAt,
  Default,
} from 'sequelize-typescript';
import { FreightRoute } from './freight-route.model';
import { Partner } from '../../masters/partner/partner.model';

@Table({
  tableName: 'freight_rates',
  timestamps: true,
  paranoid: true,
})
export class FreightRate extends Model<FreightRate> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => FreightRoute)
  @AllowNull(false)
  @Column({ field: 'route_id', type: DataType.INTEGER })
  declare routeId: number;

  @BelongsTo(() => FreightRoute)
  declare route: FreightRoute;

  @ForeignKey(() => Partner)
  @AllowNull(false)
  @Column({ field: 'partner_id', type: DataType.INTEGER })
  declare partnerId: number;

  @BelongsTo(() => Partner, 'partnerId')
  declare partner: Partner;

  @AllowNull(true)
  @Column({ type: DataType.STRING(255) })
  declare equipment: string;

  @AllowNull(true)
  @Column({ field: 'transit_days', type: DataType.INTEGER })
  declare transitDays: number;

  @AllowNull(false)
  @Default('INR')
  @Column({ type: DataType.STRING(10) })
  declare currency: string;

  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(15, 4) })
  declare amount: number;

  @AllowNull(true)
  @Column({ field: 'valid_till', type: DataType.DATEONLY })
  declare validTill: Date;

  @AllowNull(false)
  @Default('Active')
  @Column({ type: DataType.STRING(50) })
  declare status: string;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;

  @DeletedAt
  @Column({ field: 'deleted_at' })
  declare deletedAt: Date;
}
