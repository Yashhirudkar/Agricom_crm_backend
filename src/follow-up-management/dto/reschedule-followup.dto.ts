import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RescheduleFollowUpDto {
  @IsNotEmpty()
  @IsDateString()
  nextFollowupDate: string;

  @IsOptional()
  @IsString()
  ourResponse?: string;
}
