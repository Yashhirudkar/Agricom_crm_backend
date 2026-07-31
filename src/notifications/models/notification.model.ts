import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  ForeignKey,
  BelongsTo,
  PrimaryKey,
  AutoIncrement,
  Default,
  CreatedAt,
  UpdatedAt,
  Index,
} from 'sequelize-typescript';
import { User } from '../../users/models/user.model';

@Table({
  tableName: 'notifications',
  timestamps: true,
})
export class Notification extends Model<Notification> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @Index('notifications_user_id')
  @ForeignKey(() => User)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare userId: number;

  @BelongsTo(() => User, { onDelete: 'CASCADE' })
  declare user: User;

  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare type: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare referenceType: string;

  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare referenceId: number;

  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare title: string;

  @AllowNull(false)
  @Column({ type: DataType.JSONB })
  declare payload: any;

  @Default(false)
  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN })
  declare isRead: boolean;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare category: string;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  /**
   * Derives a normalized entityType string from referenceType.
   * This allows the frontend router to map without knowing every referenceType variant.
   * Route generation is NOT done here — that is the frontend's responsibility.
   */
  get entityType(): string {
    const rt = (this.referenceType || '').toLowerCase();
    if (rt === 'task') return 'TASK';
    if (rt.startsWith('leave_')) return 'LEAVE_REQUEST';
    if (rt.startsWith('holiday_') || rt === 'holiday') return 'HOLIDAY';
    if (rt.startsWith('attendance_reminder')) return 'ATTENDANCE_REMINDER';
    if (rt === 'attendance_conflict') return 'ATTENDANCE_CONFLICT';
    if (rt === 'enquiry_chat' || rt === 'enquiry') return 'ENQUIRY_CHAT';
    if (rt === 'partner_chat' || rt === 'partner') return 'PARTNER_CHAT';
    return rt.toUpperCase();
  }

  /**
   * Returns the referenceId as entityId for consistent frontend consumption.
   * Stays as a simple passthrough — no business logic here.
   */
  get entityId(): number {
    return this.referenceId;
  }

  override toJSON(): object {
    const json = super.toJSON() as any;
    json.entityType = this.entityType;
    json.entityId = this.entityId;
    return json;
  }
}
