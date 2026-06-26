import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  CreatedAt,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { PartnerRoleDynamicConfig } from './partner-role-dynamic-config.model';
import { User } from '../../users/models/user.model';

/**
 * Immutable append-only audit trail for schema changes.
 * No updates. No deletes. Ever.
 *
 * Every time a dynamic config schema is created or updated,
 * a snapshot of the schema_json is recorded here.
 */
@Table({
  tableName: 'partner_dynamic_config_history',
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['config_id'] },
    { fields: ['created_at'] },
  ],
})
export class PartnerDynamicConfigHistory extends Model<PartnerDynamicConfigHistory> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => PartnerRoleDynamicConfig)
  @AllowNull(false)
  @Column({ field: 'config_id', type: DataType.INTEGER })
  declare configId: number;

  @BelongsTo(() => PartnerRoleDynamicConfig)
  declare config: PartnerRoleDynamicConfig;

  /**
   * Full snapshot of schema_json at the time this history entry was created.
   * Even if the config row changes, this snapshot remains permanent.
   */
  @AllowNull(false)
  @Column({ field: 'schema_json', type: DataType.JSONB })
  declare schemaJson: Record<string, any>;

  /**
   * Developer-written note describing what changed in this version.
   * Example: "Added Commission % field for Broker role"
   */
  @AllowNull(true)
  @Column({ field: 'change_note', type: DataType.TEXT })
  declare changeNote: string | null;

  /**
   * The user who triggered this config change.
   * Nullable to allow system/seed-driven changes.
   */
  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'created_by', type: DataType.INTEGER })
  declare createdBy: number | null;

  @BelongsTo(() => User, { foreignKey: 'created_by' })
  declare creator: User;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
