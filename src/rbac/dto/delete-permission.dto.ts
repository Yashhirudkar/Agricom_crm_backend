import { IsInt, IsNotEmpty } from 'class-validator';

export class DeletePermissionDto {
  @IsInt()
  @IsNotEmpty()
  id: number;
}
