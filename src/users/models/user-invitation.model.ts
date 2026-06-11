import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  PrimaryKey,
  AutoIncrement,
  Default,
  AllowNull,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { User } from './user.model';
import { Client } from '../../clients/models/client.model';
import { Role } from '../../rbac/models/role.model';

@Table({
  tableName: 'user_invitations',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['token'],
    },
    {
      unique: true,
      fields: ['email'],
    }
  ]
})
export class UserInvitation extends Model<UserInvitation> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @AllowNull(false)
  @Column({ type: DataType.STRING })
  declare email: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING })
  declare token: string;

  @ForeignKey(() => Client)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare clientId: number;

  @BelongsTo(() => Client)
  declare client: Client;

  @ForeignKey(() => Role)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare roleId: number;

  @BelongsTo(() => Role)
  declare role: Role;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare companyIds: number[]; // Array of company IDs they will join

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare createdBy: number;

  @BelongsTo(() => User, { foreignKey: 'createdBy' })
  declare creator: User;

  @AllowNull(false)
  @Column({ type: DataType.DATE })
  declare expiresAt: Date;

  @Default('Pending')
  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare status: string; // 'Pending', 'Accepted', 'Expired'

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
