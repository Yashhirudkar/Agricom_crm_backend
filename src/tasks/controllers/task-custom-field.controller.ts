import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TaskCustomFieldService } from '../services/task-custom-field.service';
import {
  CreateCustomFieldDto,
  UpdateCustomFieldDto,
  SetCustomFieldValueDto,
} from '../dto/task-custom-field.dto';

@ApiTags('Task Custom Fields')
@UseGuards(JwtAuthGuard)
@Controller()
export class TaskCustomFieldController {
  constructor(private readonly service: TaskCustomFieldService) {}

  // ── Field Definitions ─────────────────────────────────────────
  @Post('v1/tasks/custom-fields')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a custom field definition for the tenant' })
  async createField(@Req() req: any, @Body() dto: CreateCustomFieldDto) {
    const clientId = req.user?.clientId || 1;
    const field = await this.service.createField(clientId, dto);
    return { success: true, data: field };
  }

  @Get('v1/tasks/custom-fields')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'List all custom fields for the tenant' })
  async listFields(@Req() req: any) {
    const clientId = req.user?.clientId || 1;
    const fields = await this.service.listFields(clientId);
    return { success: true, data: fields };
  }

  @Patch('v1/tasks/custom-fields/:fieldId')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Update a custom field definition' })
  async updateField(
    @Req() req: any,
    @Param('fieldId', ParseIntPipe) fieldId: number,
    @Body() dto: UpdateCustomFieldDto,
  ) {
    const clientId = req.user?.clientId || 1;
    const field = await this.service.updateField(clientId, fieldId, dto);
    return { success: true, data: field };
  }

  @Delete('v1/tasks/custom-fields/:fieldId')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Delete a custom field definition' })
  async deleteField(
    @Req() req: any,
    @Param('fieldId', ParseIntPipe) fieldId: number,
  ) {
    const clientId = req.user?.clientId || 1;
    await this.service.deleteField(clientId, fieldId);
    return { success: true, message: 'Custom field deleted' };
  }

  // ── Task Field Values ─────────────────────────────────────────
  @Post('v1/tasks/:taskId/custom-fields')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Set or upsert a custom field value on a task' })
  async setTaskFieldValue(
    @Req() req: any,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: SetCustomFieldValueDto,
  ) {
    const clientId = req.user?.clientId || 1;
    const value = await this.service.setTaskFieldValue(taskId, clientId, dto);
    return { success: true, data: value };
  }

  @Get('v1/tasks/:taskId/custom-fields')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Get all custom field values for a task' })
  async getTaskFieldValues(
    @Req() req: any,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    const clientId = req.user?.clientId || 1;
    const values = await this.service.getTaskFieldValues(taskId, clientId);
    return { success: true, data: values };
  }

  @Patch('v1/tasks/:taskId/custom-fields/:valueId')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Update a specific custom field value on a task' })
  async updateTaskFieldValue(
    @Req() req: any,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('valueId', ParseIntPipe) valueId: number,
    @Body() dto: Partial<SetCustomFieldValueDto>,
  ) {
    const clientId = req.user?.clientId || 1;
    const value = await this.service.updateTaskFieldValue(
      taskId,
      clientId,
      valueId,
      dto,
    );
    return { success: true, data: value };
  }
}
