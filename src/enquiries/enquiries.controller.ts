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
import { RequireAnyPermission } from '../rbac/decorators/require-any-permission.decorator';
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
  @RequireAnyPermission('enquiry:view', 'sales_contract:view', 'confirmed_orders:view')
  findAll(@Query() query: QueryEnquiryDto, @Req() req: any) {
    (query as any).companyId = req.user?.companyId;
    return this.enquiriesService.findAll(query);
  }

  @Get(':id')
  @RequireAnyPermission('enquiry:view', 'sales_contract:view', 'confirmed_orders:view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.enquiriesService.findOne(id, req.user?.companyId);
  }

  @Patch(':id')
  @RequireAnyPermission('enquiry:update', 'sales_contract:update', 'confirmed_orders:update')
  @AuditLog({ entityType: 'Enquiry', action: 'UPDATE' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateEnquiryDto: UpdateEnquiryDto,
    @Req() req: any,
  ) {
    return this.enquiriesService.update(id, updateEnquiryDto, req.user);
  }

  @Delete(':id')
  @RequireAnyPermission('enquiry:delete', 'sales_contract:delete', 'confirmed_orders:delete')
  @AuditLog({ entityType: 'Enquiry', action: 'DELETE' })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('reason') reason?: string,
    @Req() req?: any,
  ) {
    return this.enquiriesService.remove(id, reason, req?.user);
  }

  @Get(':id/transport-details')
  @RequireAnyPermission('enquiry:view', 'sales_contract:view', 'confirmed_orders:view')
  getTransportDetails(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.enquiriesService.getTransportDetails(id, req.user?.companyId);
  }

  @Put(':id/transport-details')
  @RequireAnyPermission('enquiry:update', 'sales_contract:update', 'confirmed_orders:update')
  updateTransportDetails(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { transportDetails: any[] },
    @Req() req: any,
  ) {
    return this.enquiriesService.updateTransportDetails(
      id,
      req.user?.companyId,
      body.transportDetails ?? [],
    );
  }

  @Get(':id/destinations')
  @RequireAnyPermission('enquiry:view', 'sales_contract:view', 'confirmed_orders:view')
  getDestinations(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.enquiriesService.getDestinations(id, req.user?.companyId);
  }

  @Put(':id/destinations')
  @RequireAnyPermission('enquiry:update', 'sales_contract:update', 'confirmed_orders:update')
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

  @Get(':id/activity')
  @RequireAnyPermission('enquiry:view', 'sales_contract:view', 'confirmed_orders:view')
  getActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('before') before?: number,
  ) {
    return this.enquiriesService.getActivity(id, { limit, offset, before });
  }

  @Post(':id/activity')
  @RequireAnyPermission('enquiry:update', 'sales_contract:update', 'confirmed_orders:update')
  createActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.enquiriesService.createActivity(id, body, req.user);
  }

  @Post(':id/activity/incoming-whatsapp')
  @RequireAnyPermission('enquiry:update', 'sales_contract:update', 'confirmed_orders:update')
  createIncomingWhatsApp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { message: string; sender?: string },
  ) {
    return this.enquiriesService.createActivity(id, {
      activityType: 'WHATSAPP_RECEIVED',
      message: body.message,
      metadata: { sender: body.sender },
    });
  }

  @Get(':id/price-history')
  @RequireAnyPermission('enquiry:view', 'sales_contract:view', 'confirmed_orders:view')
  getPriceHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.enquiriesService.getPriceHistory(id);
  }
}
