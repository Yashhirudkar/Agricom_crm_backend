import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { ShiftsService } from '../services/shifts.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { CreateShiftDto, UpdateShiftDto } from '../dto/shift.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  private getCompanyId(req: any): number {
    const companyId = req.headers['x-company-id'] || req.activeCompanyId;
    if (!companyId) {
      throw new BadRequestException('x-company-id header is required');
    }
    return parseInt(companyId, 10);
  }

  @Post()
  @RequirePermission('attendance:update')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateShiftDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    return this.shiftsService.createShift(companyId, dto);
  }

  @Get()
  @RequirePermission('attendance:read')
  findAll(@Request() req) {
    const companyId = this.getCompanyId(req);
    return this.shiftsService.getShifts(companyId);
  }

  @Get(':id')
  @RequirePermission('attendance:read')
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    return this.shiftsService.getShiftById(id, companyId);
  }

  @Put(':id')
  @RequirePermission('attendance:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateShiftDto,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    return this.shiftsService.updateShift(id, companyId, dto);
  }

  @Delete(':id')
  @RequirePermission('attendance:update')
  remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    return this.shiftsService.deleteShift(id, companyId);
  }
}
