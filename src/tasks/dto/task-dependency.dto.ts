import { IsInt, IsNotEmpty, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTaskDependencyDto {
  @ApiProperty({ description: 'ID of the task this task depends on' })
  @IsNotEmpty()
  @IsInt()
  dependsOnTaskId: number;

  @ApiProperty({
    description: 'Dependency type',
    enum: ['BLOCKS', 'BLOCKED_BY', 'WAITING_ON', 'RELATES_TO'],
  })
  @IsIn(['BLOCKS', 'BLOCKED_BY', 'WAITING_ON', 'RELATES_TO'])
  dependencyType: string;
}
