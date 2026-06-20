import { Index, Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt, } from 'sequelize-typescript';
import { Role } from './role.model';
import { ResourceAction } from '../../system/models/resource-action.model';

@Table({
  tableName: 'role_action_permissions',
  timestamps: true,
})
export class RoleActionPermission extends Model<RoleActionPermission> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Role)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare role_id: number;

  @BelongsTo(() => Role)
  declare role: Role;

  @ForeignKey(() => ResourceAction)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare resource_action_id: number;

  @BelongsTo(() => ResourceAction)
  declare resourceAction: ResourceAction;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
