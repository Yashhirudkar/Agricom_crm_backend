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
import { User } from '../../users/models/user.model';

export enum LabelScope {
  GLOBAL = 'GLOBAL',
  COMPANY = 'COMPANY',
  PERSONAL = 'PERSONAL',
}

@Table({
  tableName: 'conversation_labels',
  timestamps: true,
  indexes: [
    {
      fields: ['companyId'],
    },
    {
      fields: ['userId'],
    },
  ],
})
export class ConversationLabel extends Model<ConversationLabel> {
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

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare userId: number | null;

  @BelongsTo(() => User, { foreignKey: 'userId', onDelete: 'CASCADE' })
  declare user: User | null;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare name: string;

  @AllowNull(false)
  @Default('#4F46E5')
  @Column({ type: DataType.STRING(20) })
  declare color: string;

  @AllowNull(false)
  @Default(LabelScope.COMPANY)
  @Column({
    type: DataType.ENUM(LabelScope.GLOBAL, LabelScope.COMPANY, LabelScope.PERSONAL),
  })
  declare scope: LabelScope;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
