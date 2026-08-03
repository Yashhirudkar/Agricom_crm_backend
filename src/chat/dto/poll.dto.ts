import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  ArrayMinSize,
  IsNumber,
} from 'class-validator';

export class CreatePollDto {
  @IsString()
  @IsNotEmpty()
  question: string;

  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  options: string[];

  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean = false;

  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean = false;
}

export class VotePollDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  optionIds: number[];
}
