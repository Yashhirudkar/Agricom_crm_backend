import { IsString, IsNotEmpty, IsOptional, IsInt, IsBoolean } from 'class-validator';

export class CreateChargeMasterDto {
  @IsString()
  @IsNotEmpty({ message: 'Charge Name is required.' })
  chargeName: string;

  @IsString()
  @IsNotEmpty({ message: 'Mode is required.' })
  mode: string;

  @IsString()
  @IsOptional()
  chargeCode?: string;

  @IsInt()
  @IsOptional()
  displayOrder?: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
