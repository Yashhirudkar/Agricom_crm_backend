import { Table, Column, Model, DataType, ForeignKey, BelongsTo, PrimaryKey, AutoIncrement, CreatedAt, UpdatedAt } from 'sequelize-typescript';
import { User } from '../../users/models/user.model';

export enum ActorType {
  EMPLOYEE = 'EMPLOYEE',
  ADMIN = 'ADMIN',
  SYSTEM = 'SYSTEM',
}

@Table({
  tableName: 'profile_activity_logs',
  timestamps: true,
})
export class ProfileActivityLog extends Model<ProfileActivityLog> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare userId: number;

  @BelongsTo(() => User)
  declare user: User;

  @Column({ type: DataType.STRING(100), allowNull: false })
  declare fieldName: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare oldValue: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare newValue: string;

  @Column({ 
    type: DataType.ENUM('EMPLOYEE', 'ADMIN', 'SYSTEM'), 
    allowNull: false, 
    defaultValue: 'EMPLOYEE' 
  })
  declare actorType: ActorType;

  @Column({ type: DataType.STRING(45), allowNull: true })
  declare ipAddress: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare userAgent: string;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
