import { IsInt, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddFollowerDto {
  @ApiProperty({ description: 'Employee ID to add as a follower' })
  @IsNotEmpty()
  @IsInt()
  userId: number;
}
