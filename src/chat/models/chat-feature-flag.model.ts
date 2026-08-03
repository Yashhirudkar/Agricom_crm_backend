import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  PrimaryKey,
  AutoIncrement,
  Default,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
  BelongsTo,
  Index,
} from 'sequelize-typescript';
import { Company } from '../../companies/models/company.model';

@Table({
  tableName: 'chat_feature_flags',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['companyId', 'featureKey'],
    },
  ],
})
export class ChatFeatureFlag extends Model<ChatFeatureFlag> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Company)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare companyId: number | null;

  @BelongsTo(() => Company, { onDelete: 'CASCADE' })
  declare company: Company | null;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare featureKey: string;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare isEnabled: boolean;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare description: string | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
