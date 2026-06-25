import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsIn,
  IsArray,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const FIELD_TYPES = ['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'DROPDOWN'];

export class CreateCustomFieldDto {
  @ApiProperty({ description: 'Field display name', maxLength: 100 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'Field type', enum: FIELD_TYPES })
  @IsIn(FIELD_TYPES)
  fieldType: string;

  @ApiPropertyOptional({
    description: 'Dropdown options (array of strings)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  options?: string[];

  @ApiPropertyOptional({
    description: 'Is this field required?',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}

export class UpdateCustomFieldDto {
  @ApiPropertyOptional({ description: 'Updated field name', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated dropdown options',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  options?: string[];

  @ApiPropertyOptional({ description: 'Updated required flag' })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ description: 'Activate or deactivate the field' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SetCustomFieldValueDto {
  @ApiProperty({ description: 'Custom field definition ID' })
  customFieldId: number;

  @ApiPropertyOptional() @IsOptional() @IsString() textValue?: string;
  @ApiPropertyOptional() @IsOptional() numberValue?: number;
  @ApiPropertyOptional() @IsOptional() dateValue?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() booleanValue?: boolean;
}
