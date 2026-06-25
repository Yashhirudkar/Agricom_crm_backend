import { IsString, IsInt, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTaskAttachmentDto {
  @ApiProperty({ description: 'The original file name' })
  @IsNotEmpty()
  @IsString()
  fileName: string;

  @ApiProperty({
    description: 'The remote URL (e.g., S3 URL) where the file is stored',
  })
  @IsNotEmpty()
  @IsString()
  fileUrl: string;

  @ApiPropertyOptional({ description: 'The MIME type of the file' })
  @IsOptional()
  @IsString()
  fileType?: string;

  @ApiPropertyOptional({ description: 'The size of the file in bytes' })
  @IsOptional()
  @IsInt()
  fileSize?: number;
}
