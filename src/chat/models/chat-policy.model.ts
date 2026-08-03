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
  tableName: 'chat_policies',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['companyId'],
    },
  ],
})
export class ChatPolicy extends Model<ChatPolicy> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Company)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare companyId: number | null; // null = global system policy

  @BelongsTo(() => Company, { onDelete: 'CASCADE' })
  declare company: Company | null;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare allowVoice: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare allowVideo: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare allowGif: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare allowPoll: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare allowExport: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare allowForward: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare allowMentionAll: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare allowAiAssistant: boolean;

  @AllowNull(false)
  @Default(104857600) // 100MB
  @Column({ type: DataType.BIGINT })
  declare maxUploadSize: number;

  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare retentionDays: number | null;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare legalHoldActive: boolean;

  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare allowedMimeTypes: string[] | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
