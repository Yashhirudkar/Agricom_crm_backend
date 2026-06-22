import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { HSCodeService } from './hs-code.service';
import { CreateHSCodeDto } from './dto/create-hs-code.dto';
import { UpdateHSCodeDto } from './dto/update-hs-code.dto';
import { QueryHSCodeDto } from './dto/query-hs-code.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { AuditLog } from '../../audit/decorators/audit-log.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('masters/hs-codes')
export class HSCodeController {
  constructor(
    private readonly hsCodeService: HSCodeService,
  ) {}

  @Post()
  @RequirePermission('hscode:create')
  @AuditLog({ entityType: 'HSCode', action: 'CREATE' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createHSCodeDto: CreateHSCodeDto) {
    return this.hsCodeService.create(createHSCodeDto);
  }

  @Get()
  @RequirePermission('hscode:view')
  async findAll(@Query() query: QueryHSCodeDto) {
    const result = await this.hsCodeService.findAll(query);
    
    return result;
  }

  @Get(':id')
  @RequirePermission('hscode:view')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const item = await this.hsCodeService.findOne(id);
    
    return item;
  }

  @Patch(':id')
  @RequirePermission('hscode:update')
  @AuditLog({ entityType: 'HSCode', action: 'UPDATE' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateHSCodeDto: UpdateHSCodeDto,
  ) {
    return this.hsCodeService.update(id, updateHSCodeDto);
  }

  @Patch(':id/restore')
  @RequirePermission('hscode:update')
  @AuditLog({ entityType: 'HSCode', action: 'RESTORE' })
  restore(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return this.hsCodeService.restore(id, req.user);
  }

  @Delete(':id')
  @RequirePermission('hscode:delete')
  @AuditLog({ entityType: 'HSCode', action: 'DELETE' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('reason') reason?: string,
    @Req() req?: any,
  ) {
    return this.hsCodeService.remove(id, reason, req?.user);
  }

  @Delete(':id/permanent')
  @RequirePermission('hscode:force_delete')
  @AuditLog({ entityType: 'HSCode', action: 'FORCE_DELETE' })
  @HttpCode(HttpStatus.NO_CONTENT)
  removePermanent(
    @Param('id', ParseIntPipe) id: number,
    @Query('reason') reason: string,
    @Req() req: any,
  ) {
    if (req.user.type !== 'super_admin') {
      throw new ForbiddenException('Super Admin only');
    }
    return this.hsCodeService.removePermanent(id, reason, req.user);
  }
}
