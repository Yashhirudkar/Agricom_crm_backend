import { Index, Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  CreatedAt,
  UpdatedAt,
  Default, } from 'sequelize-typescript';
import { Client } from '../../clients/models/client.model';
import { User } from '../../users/models/user.model';
import { HolidayCompany } from './holiday-company.model';

@Table({
  tableName: 'holidays',
  timestamps: true,
})
export class Holiday extends Model<Holiday> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Client)
  @AllowNull(false)
  @Index
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare clientId: number;

  @BelongsTo(() => Client)
  declare client: Client;

  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare title: string;

  @AllowNull(false)
  @Column({ type: DataType.DATEONLY })
  declare holidayDate: Date;

  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare holidayType: string; // PUBLIC, COMPANY, SHUTDOWN, FESTIVAL, REGIONAL

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare description: string;

  @Default(false)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare isOptional: boolean;

  @Default(true)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare isActive: boolean;

  @Default(false)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare isWeeklyOff: boolean;

  @Default(false)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare isHalfDay: boolean;

  @AllowNull(true)
  @Column({ type: DataType.TIME })
  declare halfDayStart: string;

  @AllowNull(true)
  @Column({ type: DataType.TIME })
  declare halfDayEnd: string;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare createdBy: number;

  @BelongsTo(() => User, 'createdBy')
  declare creator: User;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare updatedBy: number;

  @BelongsTo(() => User, 'updatedBy')
  declare updater: User;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @HasMany(() => HolidayCompany)
  declare holidayCompanies: HolidayCompany[];
}
