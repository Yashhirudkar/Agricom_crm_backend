import { IsInt, IsNotEmpty } from 'class-validator';

export class DeleteRoleDto {
  @IsInt()
  @IsNotEmpty()
  id: number;
}
