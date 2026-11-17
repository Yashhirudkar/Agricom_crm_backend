import { IsNumber, IsOptional } from 'class-validator';

export class AssignRolePermissionGroupDto {
  @IsNumber()
  groupId: number;

  @IsOptional()
  @IsNumber()
  roleId?: number;
}

