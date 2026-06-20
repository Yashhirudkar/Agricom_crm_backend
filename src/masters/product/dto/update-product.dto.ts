import { IsString, IsOptional, IsBoolean, MaxLength, IsNotEmpty, IsInt, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @IsNotEmpty()
  categoryId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @IsNotEmpty()
  countryId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @IsNotEmpty()
  hsCodeId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  qualitySubType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  specification?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  qty20ftContainer?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  qty40ftContainer?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  qty40hcContainer?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  truckCapacity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  wagonCapacity?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
