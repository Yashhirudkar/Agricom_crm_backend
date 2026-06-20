import { Index, Table,
  Column,
  Model,
  DataType,
  Unique,
  AllowNull,
  Default,
  HasMany, } from 'sequelize-typescript';
import { Company } from '../../companies/models/company.model';
import { Role } from '../../rbac/models/role.model';
import { ClientFolderAccess } from './client-folder-access.model';
import { ClientItemAccess } from './client-item-access.model';
import { ClientModuleAccess } from './client-module-access.model';
import { ClientActionAccess } from './client-action-access.model';

@Table({
  tableName: 'clients',
  timestamps: true,
})
export class Client extends Model<Client> {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  declare id: number;

  @AllowNull(false)
  @Column({
    type: DataType.STRING,
  })
  declare name: string;

  @Unique
  @AllowNull(false)
  @Column({
    type: DataType.STRING,
  })
  declare email: string;

  @AllowNull(false)
  @Column({
    type: DataType.STRING,
  })
  declare password: string;

  @Default(true)
  @AllowNull(false)
  @Column({
    type: DataType.BOOLEAN,
  })
  declare isActive: boolean;

  @Default('Active')
  @AllowNull(false)
  @Column({
    type: DataType.STRING(50),
  })
  declare status: string; // 'Active', 'Inactive', 'Suspended'

  @Default(3)
  @AllowNull(false)
  @Column({
    type: DataType.INTEGER,
  })
  declare allowedCompanies: number;

  @Default(15)
  @AllowNull(false)
  @Column({
    type: DataType.INTEGER,
  })
  declare allowedUsers: number;

  @HasMany(() => Company)
  declare companies: Company[];

  @HasMany(() => Role)
  declare roles: Role[];

  @HasMany(() => ClientFolderAccess)
  declare folderAccess: ClientFolderAccess[];

  @HasMany(() => ClientItemAccess)
  declare itemAccess: ClientItemAccess[];

  @HasMany(() => ClientModuleAccess)
  declare moduleAccess: ClientModuleAccess[];

  @HasMany(() => ClientActionAccess)
  declare actionAccess: ClientActionAccess[];
}
