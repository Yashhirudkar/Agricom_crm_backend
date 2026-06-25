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
  Default,
  Index,
} from 'sequelize-typescript';
import { Client } from '../../clients/models/client.model';

export enum TaskCustomFieldType {
  TEXT = 'TEXT',
  NUMBER = 'NUMBER',
  DATE = 'DATE',
  BOOLEAN = 'BOOLEAN',
  DROPDOWN = 'DROPDOWN',
}

@Table({
  tableName: 'task_custom_fields',
  timestamps: true,
})
export class TaskCustomField extends Model<TaskCustomField> {
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

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare name: string;

  @AllowNull(false)
  @Column({
    type: DataType.ENUM('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'DROPDOWN'),
  })
  declare fieldType: TaskCustomFieldType;

  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare options: any; // For DROPDOWN type

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare isRequired: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare isActive: boolean;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
