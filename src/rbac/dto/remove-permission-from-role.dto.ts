import { IsInt, IsNotEmpty } from 'class-validator';

export class RemovePermissionFromRoleDto {
  @IsInt()
  @IsNotEmpty()
  roleId: number;

  @IsInt()
  @IsNotEmpty()
  permissionId: number;
}
