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
import { ConversationType } from '../constants/chat.constants';

@Table({
  tableName: 'conversation_templates',
  timestamps: true,
  indexes: [
    {
      fields: ['companyId'],
    },
  ],
})
export class ConversationTemplate extends Model<ConversationTemplate> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Company)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare companyId: number | null; // null = global default template

  @BelongsTo(() => Company, { onDelete: 'CASCADE' })
  declare company: Company | null;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare name: string;

  @AllowNull(false)
  @Default(ConversationType.CHANNEL)
  @Column({
    type: DataType.ENUM(
      ConversationType.CHANNEL,
      ConversationType.DEPARTMENT,
      ConversationType.ANNOUNCEMENT,
      ConversationType.GROUP,
    ),
  })
  declare type: ConversationType;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare description: string | null;

  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare defaultSettings: any;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare isAutoProvisioned: boolean;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
