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

// ─── Enums ───────────────────────────────────────────────────────────────────
// Enums removed in favor of constants file (src/constants/company-options.ts)

// ─── Model ───────────────────────────────────────────────────────────────────

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

  // ── Tenant FK ──────────────────────────────────────────────────────────────

  @ForeignKey(() => Client)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare clientId: number;

  @BelongsTo(() => Client)
  declare client: Client;

  // ── Basic Info ─────────────────────────────────────────────────────────────

  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare name: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(255) })
  declare legalName: string | null;

  /** Unique tenant identifier, e.g. TNT001, AGR002 — future subdomain use */
  @Unique
  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare companyCode: string | null;

  @AllowNull(true)
  @Column({
    type: DataType.STRING(100),
  })
  declare companyType: string | null;

  @AllowNull(true)
  @Column({
    type: DataType.STRING(100),
  })
  declare industryType: string | null;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare description: string | null;

  @AllowNull(true)
  @Column({
    type: DataType.STRING(100),
    field: 'registration_number',
  })
  declare registrationNumber: string | null;

  @AllowNull(true)
  @Column({
    type: DataType.STRING(100),
    field: 'tax_number',
  })
  declare taxNumber: string | null;

  @AllowNull(true)
  @Column({
    type: DataType.INTEGER,
    field: 'employee_count',
  })
  declare employeeCount: number | null;

  @AllowNull(true)
  @Column({
    type: DataType.STRING(50),
    field: 'company_size',
  })
  declare companySize: string | null;

  // ── Branding ───────────────────────────────────────────────────────────────

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare logoUrl: string | null;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare faviconUrl: string | null;

  // ── Contact ────────────────────────────────────────────────────────────────

  @AllowNull(true)
  @Column({ type: DataType.STRING(255) })
  declare email: string | null;

  @AllowNull(true)
  @Column({ type: DataType.STRING(30) })
  declare phone: string | null;

  @AllowNull(true)
  @Column({ type: DataType.STRING(255) })
  declare website: string | null;

  // ── Address ────────────────────────────────────────────────────────────────

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare country: string | null;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare state: string | null;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare city: string | null;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare address: string | null;

  @AllowNull(true)
  @Column({ type: DataType.STRING(20) })
  declare pincode: string | null;

  // ── Business Details ───────────────────────────────────────────────────────

  @AllowNull(true)
  @Column({
    type: DataType.INTEGER,
    field: 'established_year',
  })
  declare establishedYear: number | null;

  // ── Status ─────────────────────────────────────────────────────────────────

  @Default(true)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare isActive: boolean;

  @Default('Active')
  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare status: string; // 'Active' | 'Inactive' | 'Archived'

  // ── Timestamps ─────────────────────────────────────────────────────────────

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  // ── Relationships ──────────────────────────────────────────────────────────

  @BelongsToMany(() => User, () => UserCompany)
  declare users: User[];

  @HasMany(() => UserCompany)
  declare userCompanies: UserCompany[];
}
