import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { SysModule } from './SysModule';

@Table({
  tableName: 'sub_modules',
  timestamps: true,
})
export class SubModule extends Model<SubModule> {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id: number;

  @ForeignKey(() => SysModule)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  moduleId: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  name: string;


  @Column({
    type: DataType.STRING,
    allowNull: false,
    unique: true,
  })
  key: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  route: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  icon: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  permissionKey: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  sortOrder: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  isActive: boolean;

  @BelongsTo(() => SysModule)
  module: SysModule;
}
