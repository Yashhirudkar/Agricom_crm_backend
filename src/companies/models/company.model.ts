import {
  Table,
  Column,
  Model,
  DataType,
  Unique,
  AllowNull,
  Default,
  HasMany,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  BelongsToMany,
} from 'sequelize-typescript';
import { User } from '../../users/models/user.model';
import { Client } from '../../clients/models/client.model';
import { Role } from '../../rbac/models/role.model';
import { UserCompany } from '../../users/models/user-company.model';

@Table({
  tableName: 'companies',
  timestamps: true,
})
export class Company extends Model<Company> {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  declare id: number;

  @ForeignKey(() => Client)
  @AllowNull(false)
  @Column({
    type: DataType.INTEGER,
  })
  declare clientId: number;

  @BelongsTo(() => Client)
  declare client: Client;

  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare name: string;

  @Default(true)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare isActive: boolean;

  @Default('Active')
  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare status: string; // 'Active', 'Inactive', 'Archived'

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  // Relationships
  @BelongsToMany(() => User, () => UserCompany)
  declare users: User[];

  @HasMany(() => UserCompany)
  declare userCompanies: UserCompany[];
}
