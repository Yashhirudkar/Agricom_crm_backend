import { IsInt, IsNotEmpty } from 'class-validator';

export class DeleteCompanyDto {
  @IsInt()
  @IsNotEmpty()
  id: number;
}
