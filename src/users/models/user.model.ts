import { Index, Table, Column, Model, DataType, Unique, AllowNull, Default,
  HasMany, BelongsToMany, ForeignKey, BelongsTo, } from 'sequelize-typescript';
import { UserSession } from './user-session.model';
import { Company } from '../../companies/models/company.model';
import { Client } from '../../clients/models/client.model';
import { Role } from '../../rbac/models/role.model';
import { UserRole } from '../../rbac/models/user-role.model';
import { UserCompany } from './user-company.model';

@Table({
  tableName: 'users',
  timestamps: true,
})
export class User extends Model<User> {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  declare id: number;

  @AllowNull(false)
  @Column({ type: DataType.STRING })
  declare name: string;

  @Unique
  @AllowNull(false)
  @Column({ type: DataType.STRING })
  declare email: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING })
  declare password: string;

  @Default(true)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare isActive: boolean;

  @AllowNull(true)
  @Column({ type: DataType.STRING(1000) })
  declare avatarUrl: string;

  @ForeignKey(() => Client)
  @AllowNull(true)
  @Index
  @Column({ type: DataType.INTEGER })
  declare clientId: number;

  @BelongsTo(() => Client)
  declare client: Client;

  @Default('Active')
  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare status: string; // 'Active', 'Inactive', 'Suspended', 'Invited'

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare lastLogin: Date;

  @ForeignKey(() => Company)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare lastCompanyId: number;

  @BelongsTo(() => Company, { foreignKey: 'lastCompanyId', constraints: false })
  declare lastCompany: Company;

  // Keep legacy companyId column in model definition so Sequelize doesn't crash or trigger alters, but make it simple
  @AllowNull(true)
  @Index
  @Column({ type: DataType.INTEGER })
  declare companyId: number;

  @HasMany(() => UserSession)
  declare sessions: UserSession[];

  // Many-to-many with Company through UserCompany
  @BelongsToMany(() => Company, () => UserCompany)
  declare companies: Company[];

  @HasMany(() => UserCompany)
  declare userCompanies: UserCompany[];

  // Many-to-many with Role through UserRole
  @BelongsToMany(() => Role, () => UserRole)
  declare roles: Role[];
}
