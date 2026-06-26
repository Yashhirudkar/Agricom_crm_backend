import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { HolidaysService } from '../services/holidays.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import {
  CreateHolidayDto,
  UpdateHolidayDto,
  GetHolidaysFilterDto,
  CreateRecurringHolidayDto,
} from '../dto/holiday.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('holidays')
export class HolidaysController {
  constructor(private readonly holidaysService: HolidaysService) {}

  private getCompanyId(req: any): number | null {
    const companyId = req.headers['x-company-id'] || req.activeCompanyId;
    if (!companyId) {
      return null;
    }
    return parseInt(companyId, 10);
  }

  private getActor(req: any) {
    return {
      userId: req.user.userId || req.user.sub || null,
      clientId: req.user.clientId || null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
  }

  @Post()
  @RequirePermission('holidays:create')
  @HttpCode(HttpStatus.CREATED)
  createHoliday(@Body() dto: CreateHolidayDto, @Request() req) {
    const actor = this.getActor(req);
    const clientId = req.user.type === 'super_admin' ? dto.clientId : actor.clientId;
    if (!clientId) {
      throw new BadRequestException('clientId is required');
    }
    return this.holidaysService.createHoliday(clientId, dto, actor);
  }

  @Post('recurring')
  @RequirePermission('holidays:create')
  @HttpCode(HttpStatus.CREATED)
  createRecurringHolidays(
    @Body() dto: CreateRecurringHolidayDto,
    @Request() req,
  ) {
    const actor = this.getActor(req);
    return this.holidaysService.createRecurringHolidays(
      actor.clientId,
      dto,
      actor,
    );
  }

  @Get('upcoming')
  @RequirePermission('holidays:read')
  getUpcomingHolidays(@Request() req) {
    const actor = this.getActor(req);
    const companyId = this.getCompanyId(req);
    return this.holidaysService.getUpcomingHolidays(actor.clientId, companyId);
  }

  @Get()
  @RequirePermission('holidays:read')
  getHolidays(@Query() query: GetHolidaysFilterDto, @Request() req) {
    const actor = this.getActor(req);
    const companyId = this.getCompanyId(req);
    if (companyId && !query.companyId) {
      query.companyId = companyId;
    }
    return this.holidaysService.getHolidays(actor.clientId, query);
  }

  @Get(':id')
  @RequirePermission('holidays:read')
  getHolidayById(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const actor = this.getActor(req);
    return this.holidaysService.getHolidayById(id, actor.clientId);
  }

  @Put(':id')
  @RequirePermission('holidays:update')
  updateHoliday(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHolidayDto,
    @Request() req,
  ) {
    const actor = this.getActor(req);
    return this.holidaysService.updateHoliday(id, actor.clientId, dto, actor);
  }

  @Delete(':id')
  @RequirePermission('holidays:delete')
  deleteHoliday(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const actor = this.getActor(req);
    return this.holidaysService.deleteHoliday(id, actor.clientId, actor);
  }
}
