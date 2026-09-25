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
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { CargoLoading } from './cargo-loading.model';
import { CargoReadiness } from './cargo-readiness.model';
import { User } from '../../users/models/user.model';

@Table({
  tableName: 'cargo_documents',
  timestamps: true,
  indexes: [
    { fields: ['cargo_loading_id'] },
  ],
})
export class CargoDocument extends Model<CargoDocument> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => CargoLoading)
  @AllowNull(true)
  @Column({ field: 'cargo_loading_id', type: DataType.INTEGER })
  declare cargoLoadingId: number;

  @BelongsTo(() => CargoLoading)
  declare cargoLoading: CargoLoading;

  @ForeignKey(() => CargoReadiness)
  @AllowNull(true)
  @Column({ field: 'cargo_readiness_id', type: DataType.INTEGER })
  declare cargoReadinessId: number;

  @BelongsTo(() => CargoReadiness)
  declare cargoReadiness: CargoReadiness;

  @AllowNull(false)
  @Column({ field: 'document_type', type: DataType.STRING(100) })
  declare documentType: string;

  @AllowNull(false)
  @Column({ field: 'file_name', type: DataType.STRING(255) })
  declare fileName: string;

  @AllowNull(false)
  @Column({ field: 'file_path', type: DataType.TEXT })
  declare filePath: string;

  @AllowNull(true)
  @Column({ field: 'file_size', type: DataType.INTEGER })
  declare fileSize: number;

  @AllowNull(true)
  @Column({ field: 'file_type', type: DataType.STRING(100) })
  declare fileType: string;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ field: 'uploaded_by', type: DataType.INTEGER })
  declare uploadedBy: number;

  @BelongsTo(() => User, 'uploadedBy')
  declare uploader: User;

  @AllowNull(false)
  @Column({ field: 'uploaded_at', type: DataType.DATE })
  declare uploadedAt: Date;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
