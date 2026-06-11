import { IsInt, IsNotEmpty } from 'class-validator';

export class RemoveRoleFromUserDto {
  @IsInt()
  @IsNotEmpty()
  userId: number;

  @IsInt()
  @IsNotEmpty()
  roleId: number;
}
