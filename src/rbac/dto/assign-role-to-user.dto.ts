import { IsInt, IsNotEmpty } from 'class-validator';

export class AssignRoleToUserDto {
  @IsInt()
  @IsNotEmpty()
  userId: number;

  @IsInt()
  @IsNotEmpty()
  roleId: number;
}
