import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ArchiveTaskDto {
  @ApiPropertyOptional({
    description: 'Flag indicating archive status',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}
