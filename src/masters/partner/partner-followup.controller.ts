import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { PartnerFollowUpService } from './partner-followup.service';
import { CreatePartnerFollowUpDto } from './dto/create-partner-followup.dto';
import { UpdatePartnerFollowUpDto } from './dto/update-partner-followup.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('masters/partners/:partnerId/follow-ups')
export class PartnerFollowUpController {
  constructor(private readonly partnerFollowUpService: PartnerFollowUpService) {}

  @Post()
  @RequirePermission('follow_up:create')
  create(
    @Param('partnerId') partnerId: string,
    @Body() dto: CreatePartnerFollowUpDto,
    @Req() req: any,
  ) {
    dto.partnerId = +partnerId;
    return this.partnerFollowUpService.create(dto, req.user);
  }

  @Get()
  @RequirePermission('follow_up:view')
  findAll(
    @Param('partnerId') partnerId: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.partnerFollowUpService.findAll(+partnerId, entityType, entityId ? +entityId : undefined);
  }

  @Get(':id')
  @RequirePermission('follow_up:view')
  findOne(@Param('id') id: string) {
    return this.partnerFollowUpService.findOne(+id);
  }

  @Patch(':id')
  @RequirePermission('follow_up:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePartnerFollowUpDto,
    @Req() req: any,
  ) {
    return this.partnerFollowUpService.update(+id, dto, req.user);
  }

  @Delete(':id')
  @RequirePermission('follow_up:delete')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.partnerFollowUpService.remove(+id, req.user);
  }
}
