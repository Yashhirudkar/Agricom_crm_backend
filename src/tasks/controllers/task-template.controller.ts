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
import { TaskTemplateService } from '../services/task-template.service';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  CloneTemplateDto,
} from '../dto/task-template.dto';

@ApiTags('Task Templates')
@Controller('v1/tasks/templates')
@UseGuards(JwtAuthGuard)
export class TaskTemplateController {
  constructor(private readonly service: TaskTemplateService) {}

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a task template' })
  async create(@Req() req: any, @Body() dto: CreateTemplateDto) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.userId || req.user?.id || 1;
    const template = await this.service.create(clientId, userId, dto);
    return { success: true, data: template };
  }

  @Get()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'List all templates for the tenant' })
  async findAll(@Req() req: any) {
    const clientId = req.user?.clientId || 1;
    const templates = await this.service.findAll(clientId);
    return { success: true, data: templates };
  }

  @Patch(':id')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Update a task template' })
  async update(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTemplateDto,
  ) {
    const clientId = req.user?.clientId || 1;
    const template = await this.service.update(clientId, id, dto);
    return { success: true, data: template };
  }

  @Delete(':id')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Delete a task template' })
  async remove(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const clientId = req.user?.clientId || 1;
    await this.service.delete(clientId, id);
    return { success: true, message: 'Template deleted' };
  }

  @Post(':id/clone')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a task (with subtasks) from a template' })
  async clone(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloneTemplateDto,
  ) {
    const clientId = req.user?.clientId || 1;
    const userId = req.user?.userId || req.user?.id || 1;
    const task = await this.service.cloneIntoTask(
      clientId,
      id,
      userId,
      dto,
    );
    return { success: true, message: 'Task created from template', data: task };
  }
}
