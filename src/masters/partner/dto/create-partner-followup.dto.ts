import { IsString, IsOptional, IsInt, IsDateString, IsEnum, IsBoolean } from 'class-validator';

export class CreatePartnerFollowUpDto {
  @IsOptional()
  @IsInt()
  partnerId?: number;

  @IsDateString()
  followupDate: string;

  @IsString()
  communicationType: string; // Call, Email, WhatsApp, Meeting, Negotiation

  @IsOptional()
  @IsString()
  buyerRemark?: string;

  @IsOptional()
  @IsString()
  ourResponse?: string;

  @IsOptional()
  @IsDateString()
  nextFollowupDate?: string;

  @IsOptional()
  @IsString()
  priority?: string; // High, Medium, Low

  @IsOptional()
  @IsString()
  status?: string; // Pending, Waiting Response, Confirmed, Closed, Deal Finalized

  @IsOptional()
  @IsString()
  enquiryId?: string;
}

