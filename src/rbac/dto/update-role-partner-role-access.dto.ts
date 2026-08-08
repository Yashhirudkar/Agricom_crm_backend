import { IsNumber, IsArray, IsOptional } from 'class-validator';

export class UpdateRolePartnerRoleAccessDto {
  @IsNumber()
  roleId: number;

  /**
   * Array of partner_role IDs that this RBAC role is allowed to access.
   * Empty array = no partner roles allowed (fully restricted).
   * Use null/omit = not used directly; the service interprets the array literally.
   */
  @IsArray()
  @IsNumber({}, { each: true })
  partnerRoleIds: number[];
}
