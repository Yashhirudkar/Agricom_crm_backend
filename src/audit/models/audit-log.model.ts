import {
  Index,
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { User } from '../../users/models/user.model';
import { Client } from '../../clients/models/client.model';
import { Company } from '../../companies/models/company.model';

@Table({
  tableName: 'audit_logs',
  timestamps: true,
})
export class AuditLog extends Model<AuditLog> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Client)
  @AllowNull(true)
  @Index
  @Column({ type: DataType.INTEGER })
  declare clientId: number;

  @BelongsTo(() => Client)
  declare client: Client;

  @ForeignKey(() => Company)
  @AllowNull(true)
  @Index
  @Column({ type: DataType.INTEGER })
  declare companyId: number;

  @BelongsTo(() => Company)
  declare company: Company;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Index
  @Column({ type: DataType.INTEGER })
  declare userId: number;

  @BelongsTo(() => User)
  declare user: User;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare entityType: string; // 'Client', 'Company', 'User', 'Role', etc.

  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare entityId: number;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare action: string; // 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', etc.

  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare oldValue: any;

  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare newValue: any;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare ipAddress: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(255) })
  declare userAgent: string;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
