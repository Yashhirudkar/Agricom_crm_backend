import { IsInt, IsNotEmpty } from 'class-validator';

export class AssignPermissionToRoleDto {
  @IsInt()
  @IsNotEmpty()
  roleId: number;

  @IsInt()
  @IsNotEmpty()
  permissionId: number;
}
