import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsObject,
} from 'class-validator';

export class UpdateDynamicConfigDto {
  /**
   * New human-readable name for the updated config version.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  configName: string;

  /**
   * Full updated schema definition. Same structure as CreateDynamicConfigDto.schemaJson.
   * The service will deactivate the current version and create a new version row.
   */
  @IsObject()
  @IsNotEmpty()
  schemaJson: Record<string, any>;

  /**
   * Developer note explaining what changed in this schema update.
   * Example: "Added Commission % and License Number fields for Broker"
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeNote?: string;
}
