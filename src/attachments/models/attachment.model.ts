import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  CreatedAt,
  UpdatedAt,
  DeletedAt,
} from 'sequelize-typescript';

@Table({
  tableName: 'attachments',
  timestamps: true,
  paranoid: true,
})
export class Attachment extends Model<Attachment> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @AllowNull(true)
  @Column({ field: 'entity_type', type: DataType.STRING(100) })
  declare entityType: string;

  @AllowNull(true)
  @Column({ field: 'entity_id', type: DataType.INTEGER })
  declare entityId: number;

  @AllowNull(false)
  @Column({ field: 'original_name', type: DataType.STRING(255) })
  declare originalName: string;

  @AllowNull(false)
  @Column({ field: 'stored_name', type: DataType.STRING(255) })
  declare storedName: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(10) })
  declare extension: string;

  @AllowNull(false)
  @Column({ field: 'mime_type', type: DataType.STRING(100) })
  declare mimeType: string;

  @AllowNull(false)
  @Column({ field: 'file_size', type: DataType.INTEGER })
  declare fileSize: number;

  @AllowNull(false)
  @Column({ field: 'storage_path', type: DataType.STRING(500) })
  declare storagePath: string;

  @AllowNull(false)
  @Column({ field: 'storage_disk', type: DataType.STRING(50) })
  declare storageDisk: string;

  @AllowNull(true)
  @Column({ field: 'uploaded_by', type: DataType.INTEGER })
  declare uploadedBy: number;

  @AllowNull(true)
  @Column({ field: 'company_id', type: DataType.INTEGER })
  declare companyId: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;

  @DeletedAt
  @Column({ field: 'deleted_at' })
  declare deletedAt: Date;
}
