import { IsString, IsOptional, IsBoolean, Length, MaxLength, IsNotEmpty } from 'class-validator';

export class CreateHSCodeDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 20)
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  chapter?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  subHeading?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
