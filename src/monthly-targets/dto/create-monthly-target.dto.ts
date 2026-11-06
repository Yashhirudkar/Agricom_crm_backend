import { IsNumber, IsPositive, IsOptional, Min, Max, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMonthlyTargetDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'Target MT must be a valid number' })
  @IsPositive({ message: 'Target MT must be greater than zero' })
  targetMT: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}

