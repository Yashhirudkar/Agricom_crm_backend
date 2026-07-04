import {
  IsInt,
  IsOptional,
  IsNumber,
  Min,
  IsBoolean,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBagSpecDto {
  @IsInt()
  @IsNotEmpty()
  @Type(() => Number)
  bagTypeId: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  packingTypeId?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  width?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  length?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  emptyBagWeight?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  cost?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
