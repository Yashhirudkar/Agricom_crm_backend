import { IsString, IsOptional } from 'class-validator';

export class SaveDraftDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  payload?: any;
}
