import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  PrimaryKey,
  AutoIncrement,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
  BelongsTo,
  Index,
} from 'sequelize-typescript';
import { Conversation } from './conversation.model';
import { User } from '../../users/models/user.model';
import { PrincipalType } from '../constants/chat.constants';

@Table({
  tableName: 'conversation_permission_overrides',
  timestamps: true,
})
export class ConversationPermissionOverride extends Model<ConversationPermissionOverride> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @Index
  @ForeignKey(() => Conversation)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare conversationId: number;

  @BelongsTo(() => Conversation, { onDelete: 'CASCADE' })
  declare conversation: Conversation;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare permission: string; // 'VIEW', 'POST', 'EXPORT', 'PIN', 'DELETE'

  @AllowNull(false)
  @Column({
    type: DataType.ENUM(...Object.values(PrincipalType)),
  })
  declare principalType: PrincipalType; // 'ROLE', 'EMPLOYEE', 'DEPARTMENT', etc.

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare principalId: string | null;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare createdBy: number | null;

  @BelongsTo(() => User, { foreignKey: 'createdBy', onDelete: 'SET NULL' })
  declare creator: User | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
