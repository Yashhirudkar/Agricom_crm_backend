import { Index, Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  PrimaryKey,
  AutoIncrement,
  CreatedAt,
  UpdatedAt, } from 'sequelize-typescript';
import { User } from './user.model';
import { Company } from '../../companies/models/company.model';
import { Role } from '../../rbac/models/role.model';

@Table({
  tableName: 'user_companies',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['userId', 'companyId'],
    },
    {
      fields: ['userId'],
    },
    {
      fields: ['companyId'],
    },
    {
      fields: ['roleId'],
    }
  ],
})
export class UserCompany extends Model<UserCompany> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @Index
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false, onDelete: 'CASCADE' })
  declare userId: number;

  @Index
  @ForeignKey(() => Company)
  @Column({ type: DataType.INTEGER, allowNull: false, onDelete: 'CASCADE' })
  declare companyId: number;

  @Index
  @ForeignKey(() => Role)
  @Column({ type: DataType.INTEGER, allowNull: true, onDelete: 'SET NULL' })
  declare roleId: number;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    defaultValue: 'Active',
  })
  declare status: string; // 'Active' or 'Inactive'

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsTo(() => User)
  declare user: User;

  @BelongsTo(() => Company)
  declare company: Company;

  @BelongsTo(() => Role)
  declare role: Role;
}
