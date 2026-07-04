import { IsArray, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class AssignPackagingDto {
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  bagSpecificationIds: number[];
}
