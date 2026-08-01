import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CompleteFollowUpDto {
  @IsNotEmpty()
  @IsString()
  status: string; // e.g. Confirmed, Closed, Deal Finalized

  @IsOptional()
  @IsString()
  ourResponse?: string;
}
