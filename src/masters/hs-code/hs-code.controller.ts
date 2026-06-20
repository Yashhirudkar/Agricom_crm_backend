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
  constructor(private readonly hsCodeService: HSCodeService) {}

  @Post()
  @RequirePermission('hscode:create')
  @AuditLog({ entityType: 'HSCode', action: 'CREATE' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createHSCodeDto: CreateHSCodeDto) {
    return this.hsCodeService.create(createHSCodeDto);
  }

  @Get()
  @RequirePermission('hscode:view')
  findAll(@Query() query: QueryHSCodeDto) {
    return this.hsCodeService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('hscode:view')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.hsCodeService.findOne(id);
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

  @Delete(':id')
  @RequirePermission('hscode:delete')
  @AuditLog({ entityType: 'HSCode', action: 'DELETE' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.hsCodeService.remove(id);
  }
}
