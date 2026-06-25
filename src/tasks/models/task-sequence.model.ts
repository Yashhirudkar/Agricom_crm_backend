import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  Unique,
  Index,
} from 'sequelize-typescript';
import { Client } from '../../clients/models/client.model';

@Table({
  tableName: 'task_sequences',
  timestamps: true,
})
export class TaskSequence extends Model<TaskSequence> {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  declare id: number;

  @ForeignKey(() => Client)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare clientId: number;

  @BelongsTo(() => Client)
  declare client: Client;

  @Index('task_sequences_client_prefix')
  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare modulePrefix: string; // e.g., 'TASK', 'CRM'

  @AllowNull(false)
  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  declare currentSequence: number;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
