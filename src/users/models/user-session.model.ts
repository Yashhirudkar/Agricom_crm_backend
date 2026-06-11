import { Table, Column, Model, DataType, ForeignKey, BelongsTo, PrimaryKey, AutoIncrement, Unique, AllowNull, Default } from 'sequelize-typescript';
import { User } from './user.model';

@Table({
  tableName: 'user_sessions',
  timestamps: true,
})
export class UserSession extends Model<UserSession> {
  @PrimaryKey
  @AutoIncrement
  @Column({
    type: DataType.BIGINT,
  })
  declare id: bigint;

  @Unique
  @Default(DataType.UUIDV4)
  @AllowNull(false)
  @Column({
    type: DataType.UUID,
  })
  declare sessionId: string;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({
    type: DataType.INTEGER,
    onDelete: 'CASCADE',
  })
  declare userId: number;

  @BelongsTo(() => User)
  declare user: User;

  @ForeignKey(() => require('../../clients/models/client.model').Client)
  @AllowNull(true)
  @Column({
    type: DataType.INTEGER,
    onDelete: 'CASCADE',
  })
  declare clientId: number;

  @BelongsTo(() => require('../../clients/models/client.model').Client)
  declare client: any;

  @Unique
  @AllowNull(false)
  @Column({
    type: DataType.STRING,
  })
  declare refreshTokenHash: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare ipAddress: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare userAgent: string;

  @AllowNull(false)
  @Column({
    type: DataType.DATE,
  })
  declare expiresAt: Date;

  @AllowNull(false)
  @Column({
    type: DataType.DATE,
  })
  declare lastUsedAt: Date;

  @Default(false)
  @AllowNull(false)
  @Column({
    type: DataType.BOOLEAN,
  })
  declare isRevoked: boolean;
}
