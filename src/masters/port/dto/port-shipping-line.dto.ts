import { IsNotEmpty, IsOptional, IsString, IsNumber } from 'class-validator';

export class AddShippingLineToPortDto {
  @IsOptional()
  @IsNumber()
  shipping_line_id?: number;

  @IsOptional()
  @IsNumber()
  shippingLineId?: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}
