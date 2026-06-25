import { IsInt, IsOptional, IsString, Min, IsPositive } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class ManualTimeEntryDto {
  @ApiProperty({ description: 'Duration in minutes', minimum: 1 })
  @IsPositive()
  @IsInt()
  durationMinutes: number;

  @ApiPropertyOptional({ description: 'Notes for this time entry' })
  @IsOptional()
  @IsString()
  notes?: string;
}
