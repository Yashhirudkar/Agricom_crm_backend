import { PartialType } from '@nestjs/mapped-types';
import { CreatePartnerFollowUpDto } from './create-partner-followup.dto';
import { IsOptional, IsBoolean } from 'class-validator';

export class UpdatePartnerFollowUpDto extends PartialType(CreatePartnerFollowUpDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
