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
  HasMany,
  Index,
} from 'sequelize-typescript';
import { PartnerRole } from './partner-role.model';
import { PartnerDynamicConfigHistory } from './partner-dynamic-config-history.model';

@Table({
  tableName: 'partner_role_dynamic_configs',
  timestamps: true,
  indexes: [
    { fields: ['partner_role_id'] },
    { fields: ['is_active'] },
    { fields: ['partner_role_id', 'version'] },
  ],
})
export class PartnerRoleDynamicConfig extends Model<PartnerRoleDynamicConfig> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => PartnerRole)
  @AllowNull(false)
  @Column({ field: 'partner_role_id', type: DataType.INTEGER })
  declare partnerRoleId: number;

  @BelongsTo(() => PartnerRole)
  declare partnerRole: PartnerRole;

  @AllowNull(false)
  @Column({ field: 'config_name', type: DataType.STRING(200) })
  declare configName: string;

  /**
   * Full schema definition in JSONB.
   *
   * Structure:
   * {
   *   "fields": [
   *     {
   *       "key": "warehouse_type",
   *       "label": "Warehouse Type",
   *       "type": "multiselect",          // text | textarea | number | email | date | select | multiselect | checkbox
   *       "required": false,
   *       "order": 1,
   *       "options": ["Storage", "Cleaning", "Factory Stuffing", "CFS"],
   *       "children": {
   *         "Port": [
   *           { "key": "port_address", "label": "Port Address", "type": "text", "required": false, "order": 1 }
   *         ]
   *       }
   *     }
   *   ]
   * }
   *
   * "children" is optional. If present, keys are the triggering option values.
   * Each child is a simplified field definition (no nested children allowed on children).
   */
  @AllowNull(false)
  @Default({})
  @Column({ field: 'schema_json', type: DataType.JSONB })
  declare schemaJson: Record<string, any>;

  @AllowNull(false)
  @Default(1)
  @Column({ type: DataType.INTEGER })
  declare version: number;

  @AllowNull(false)
  @Default(true)
  @Column({ field: 'is_active', type: DataType.BOOLEAN })
  declare isActive: boolean;

  @HasMany(() => PartnerDynamicConfigHistory, { onDelete: 'CASCADE', hooks: true })
  declare history: PartnerDynamicConfigHistory[];

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
