import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Default,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
  BelongsTo,
  Index,
} from 'sequelize-typescript';
import { Partner } from './partner.model';
import { PartnerRoleDynamicConfig } from '../partner-role/partner-role-dynamic-config.model';

/**
 * Stores actual field values submitted by a partner for their role's dynamic schema.
 *
 * Design decisions:
 * - UNIQUE(partner_id, config_id): one value record per partner per config version.
 *   Future-proofs for multiple configs per partner (operational, compliance, shipping, etc.)
 * - config_id FK: pins the values to the exact schema version used at submission.
 *   Schema updates never corrupt historical data.
 * - schema_version: snapshot of the version number at save time, for extra safety
 *   if config rows are ever modified or rolled back.
 * - values_json (JSONB): flexible storage supporting arrays (multiselect),
 *   strings (text), and nested child field values.
 */
@Table({
  tableName: 'partner_dynamic_values',
  timestamps: true,
  indexes: [
    {
      // Correction 2: UNIQUE(partner_id, config_id) instead of partner_id UNIQUE alone.
      // Allows future multiple configs per partner.
      unique: true,
      fields: ['partner_id', 'config_id'],
      name: 'partner_dynamic_values_partner_config_unique',
    },
    { fields: ['partner_id'] },
    { fields: ['config_id'] },
  ],
})
export class PartnerDynamicValues extends Model<PartnerDynamicValues> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Partner)
  @AllowNull(false)
  @Column({ field: 'partner_id', type: DataType.INTEGER })
  declare partnerId: number;

  @BelongsTo(() => Partner)
  declare partner: Partner;

  @ForeignKey(() => PartnerRoleDynamicConfig)
  @AllowNull(false)
  @Column({ field: 'config_id', type: DataType.INTEGER })
  declare configId: number;

  @BelongsTo(() => PartnerRoleDynamicConfig)
  declare config: PartnerRoleDynamicConfig;

  /**
   * Correction 3: Snapshot of the schema version at save time.
   * Provides enterprise-grade safety for rollback scenarios or accidental config row changes.
   * Even if config_id row is altered, this version integer tells us exactly what schema was used.
   */
  @AllowNull(false)
  @Default(1)
  @Column({ field: 'schema_version', type: DataType.INTEGER })
  declare schemaVersion: number;

  /**
   * Actual submitted field values as a flat JSONB object.
   *
   * Example (Buyer — Port + Road selected):
   * {
   *   "delivery_mode": ["Port", "Road"],
   *   "port_address": "JNPT Mumbai Gate 4",
   *   "port_custom_clearance_address": "CHA Office, Nhava Sheva",
   *   "road_address": "NH-48 Delhi Ring Road",
   *   "road_custom_clearance_address": "ICD Tughlakabad, Delhi"
   * }
   *
   * Example (Warehouse):
   * {
   *   "warehouse_type": ["Storage", "Cleaning"]
   * }
   */
  @AllowNull(false)
  @Default({})
  @Column({ field: 'values_json', type: DataType.JSONB })
  declare valuesJson: Record<string, any>;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
