import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  Index,
} from 'sequelize-typescript';
import { Role } from '../../rbac/models/role.model';
import { PartnerRole } from '../partner-role/partner-role.model';

@Table({
  tableName: 'role_partner_role_access',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['role_id', 'partner_role_id'] },
  ],
})
export class RolePartnerRoleAccess extends Model<RolePartnerRoleAccess> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @Index
  @ForeignKey(() => Role)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'role_id' })
  declare roleId: number;

  @BelongsTo(() => Role, { onDelete: 'CASCADE' })
  declare role: Role;

  @Index
  @ForeignKey(() => PartnerRole)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'partner_role_id' })
  declare partnerRoleId: number;

  @BelongsTo(() => PartnerRole, { onDelete: 'CASCADE' })
  declare partnerRole: PartnerRole;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
