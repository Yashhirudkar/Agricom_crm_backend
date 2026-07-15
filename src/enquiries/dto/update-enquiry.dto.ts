import { PartialType } from '@nestjs/swagger';
import { CreateEnquiryDto } from './create-enquiry.dto';
import { IsOptional, IsEnum } from 'class-validator';
import { EnquiryStatus } from '../enquiry.constants';

export class UpdateEnquiryDto extends PartialType(CreateEnquiryDto) {
  @IsOptional()
  @IsEnum(EnquiryStatus)
  status?: string;
}
