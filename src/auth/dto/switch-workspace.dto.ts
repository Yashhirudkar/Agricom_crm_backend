import { IsNumber } from 'class-validator';

export class SwitchWorkspaceDto {
  @IsNumber()
  companyId: number;
}
