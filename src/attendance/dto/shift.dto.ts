import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsBoolean,
  IsArray,
  IsOptional,
  Matches,
} from 'class-validator';

export class CreateShiftDto {
  @IsString()
  @IsNotEmpty()
  declare name: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'startTime must be in HH:MM format (24-hour style)',
  })
  declare startTime: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'endTime must be in HH:MM format (24-hour style)',
  })
  declare endTime: string;

  @IsNumber()
  @IsOptional()
  declare breakMinutes?: number;

  @IsNumber()
  @IsOptional()
  declare gracePeriodMinutes?: number;

  @IsBoolean()
  @IsOptional()
  declare isNightShift?: boolean;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  declare weeklyOffDays?: number[];
}

export class UpdateShiftDto {
  @IsString()
  @IsOptional()
  declare name?: string;

  @IsString()
  @IsOptional()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'startTime must be in HH:MM format (24-hour style)',
  })
  declare startTime?: string;

  @IsString()
  @IsOptional()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'endTime must be in HH:MM format (24-hour style)',
  })
  declare endTime?: string;

  @IsNumber()
  @IsOptional()
  declare breakMinutes?: number;

  @IsNumber()
  @IsOptional()
  declare gracePeriodMinutes?: number;

  @IsBoolean()
  @IsOptional()
  declare isNightShift?: boolean;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  declare weeklyOffDays?: number[];
}
