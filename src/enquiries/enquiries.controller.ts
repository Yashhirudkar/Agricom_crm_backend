import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { EnquiriesService } from './enquiries.service';
import { CreateEnquiryDto } from './dto/create-enquiry.dto';
import { UpdateEnquiryDto } from './dto/update-enquiry.dto';
import { QueryEnquiryDto } from './dto/query-enquiry.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { AuditLog } from '../audit/decorators/audit-log.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('enquiries')
export class EnquiriesController {
  constructor(private readonly enquiriesService: EnquiriesService) {}

  @Post()
  @RequirePermission('enquiry:create')
  @AuditLog({ entityType: 'Enquiry', action: 'CREATE' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createEnquiryDto: CreateEnquiryDto, @Req() req: any) {
    return this.enquiriesService.create(createEnquiryDto, req.user);
  }

  @Get()
  @RequirePermission('enquiry:view')
  findAll(@Query() query: QueryEnquiryDto, @Req() req: any) {
    (query as any).companyId = req.user?.companyId;
    return this.enquiriesService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('enquiry:view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.enquiriesService.findOne(id, req.user?.companyId);
  }

  @Patch(':id')
  @RequirePermission('enquiry:update')
  @AuditLog({ entityType: 'Enquiry', action: 'UPDATE' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateEnquiryDto: UpdateEnquiryDto,
    @Req() req: any,
  ) {
    return this.enquiriesService.update(id, updateEnquiryDto, req.user);
  }

  @Delete(':id')
  @RequirePermission('enquiry:delete')
  @AuditLog({ entityType: 'Enquiry', action: 'DELETE' })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('reason') reason?: string,
    @Req() req?: any,
  ) {
    return this.enquiriesService.remove(id, reason, req?.user);
  }

  @Get(':id/loading-points')
  @RequirePermission('enquiry:view')
  getLoadingPoints(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.enquiriesService.getLoadingPoints(id, req.user?.companyId);
  }

  @Put(':id/loading-points')
  @RequirePermission('enquiry:update')
  updateLoadingPoints(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('loadingPoints') loadingPoints: string[],
    @Req() req: any,
  ) {
    return this.enquiriesService.updateLoadingPoints(
      id,
      req.user?.companyId,
      loadingPoints ?? [],
    );
  }

  @Get(':id/destinations')
  @RequirePermission('enquiry:view')
  getDestinations(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.enquiriesService.getDestinations(id, req.user?.companyId);
  }

  @Put(':id/destinations')
  @RequirePermission('enquiry:update')
  updateDestinations(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('destinations') destinations: string[],
    @Req() req: any,
  ) {
    return this.enquiriesService.updateDestinations(
      id,
      req.user?.companyId,
      destinations ?? [],
    );
  }
}
