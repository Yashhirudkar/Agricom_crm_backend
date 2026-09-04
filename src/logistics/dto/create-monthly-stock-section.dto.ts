import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSectionDto {
  @IsNotEmpty()
  @IsString()
  sectionName: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  presetColumns?: string[];
}

export class UpdateSectionDto {
  @IsOptional()
  @IsString()
  sectionName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  layoutWidth?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  layoutX?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  layoutY?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  layoutHeight?: number;
}

export class CreateColumnDto {
  @IsNotEmpty()
  @IsString()
  columnName: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  displayOrder?: number;
}

export class UpdateColumnDto {
  @IsNotEmpty()
  @IsString()
  columnName: string;
}

export class CreateRowDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  rowOrder?: number;

  @IsOptional()
  @IsBoolean()
  isTotalRow?: boolean = false;
}

export class CellInputDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  columnId?: number;

  @IsOptional()
  @IsString()
  columnKey?: string;

  @IsOptional()
  @IsString()
  value?: string;
}

export class RowInputDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  rowOrder?: number;

  @IsOptional()
  @IsBoolean()
  isTotalRow?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CellInputDto)
  cells?: CellInputDto[];

  @IsOptional()
  cellsMap?: any;
}

export class ColumnInputDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id?: number;

  @IsNotEmpty()
  @IsString()
  columnName: string;

  @IsOptional()
  @IsString()
  columnKey?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  sectionId?: any;

  @IsOptional()
  createdAt?: any;

  @IsOptional()
  updatedAt?: any;
}

export class BulkSaveSectionDto {
  @IsOptional()
  @IsString()
  sectionName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  layoutWidth?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  layoutX?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  layoutY?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  layoutHeight?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnInputDto)
  columns?: ColumnInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RowInputDto)
  rows?: RowInputDto[];
}

export class SectionSavePayloadDto extends BulkSaveSectionDto {
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  sectionId: number;
}

export class BulkSaveReportDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionSavePayloadDto)
  sections: SectionSavePayloadDto[];
}

export class ReorderItemDto {
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  id: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  order: number;
}

export class ReorderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items: ReorderItemDto[];
}

