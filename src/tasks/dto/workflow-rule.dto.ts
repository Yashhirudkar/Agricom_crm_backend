import {
  IsString,
  IsInt,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WorkflowActionDto {
  @ApiProperty({
    description: 'Type of action to execute',
    enum: [
      'CREATE_TASK',
      'SEND_EMAIL',
      'SEND_NOTIFICATION',
      'UPDATE_FIELD',
      'WAIT_DELAY',
    ],
  })
  @IsString()
  actionType: string;

  @ApiProperty({ description: 'Configuration payload for the action' })
  @IsOptional()
  actionPayload: any;

  @ApiPropertyOptional({
    description: 'Order of execution among multiple actions',
    default: 0,
  })
  @IsOptional()
  @IsInt()
  executionOrder?: number;
}

export class CreateWorkflowRuleDto {
  @ApiProperty({ description: 'Name of the workflow rule' })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'The entity module this rule applies to',
    example: 'Task',
  })
  @IsString()
  entityModule: string;

  @ApiProperty({ description: 'The trigger event type', example: 'ON_UPDATE' })
  @IsString()
  triggerType: string;

  @ApiProperty({ description: 'Advanced JSON conditions AST' })
  @IsOptional()
  conditions: any;

  @ApiPropertyOptional({
    description: 'Execution order of this rule',
    default: 0,
  })
  @IsOptional()
  @IsInt()
  executionOrder?: number;

  @ApiProperty({
    description: 'List of actions to execute',
    type: [WorkflowActionDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowActionDto)
  actions: WorkflowActionDto[];
}
