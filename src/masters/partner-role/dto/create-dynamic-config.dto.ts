import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsObject,
} from 'class-validator';

export class CreateDynamicConfigDto {
  /**
   * Human-readable name for this config version.
   * Example: "Warehouse Config v1", "Buyer Config - Initial"
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  configName: string;

  /**
   * Full schema definition. Must conform to the documented JSONB structure:
   * {
   *   "fields": [
   *     {
   *       "key": string,
   *       "label": string,
   *       "type": "text" | "textarea" | "number" | "email" | "date" | "select" | "multiselect" | "checkbox",
   *       "required": boolean,
   *       "order": number,
   *       "options": string[],          // required for select and multiselect
   *       "children": {                  // optional: conditional child fields
   *         "[optionValue]": [
   *           { "key": string, "label": string, "type": string, "required": boolean, "order": number }
   *         ]
   *       }
   *     }
   *   ]
   * }
   */
  @IsObject()
  @IsNotEmpty()
  schemaJson: Record<string, any>;

  /**
   * Developer note describing the initial schema.
   * Stored in history table for audit trail.
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeNote?: string;
}
