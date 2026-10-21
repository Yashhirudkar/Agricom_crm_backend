import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateManualReadinessDto {
  /**
   * Manual override value:
   * - null: Default (Use System Status)
   * - true: Yes (Force Ready)
   * - false: No (Force Not Ready)
   */
  @IsOptional()
  @IsBoolean()
  manualReadyOverride?: boolean | null;

  /**
   * Justification/reason for overriding readiness. Required when manualReadyOverride is true or false.
   */
  @IsOptional()
  @IsString()
  reason?: string;
}
