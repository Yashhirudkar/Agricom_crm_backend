import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ErpDiscussionService } from '../services/erp-discussion.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('chat/erp-discussions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ErpDiscussionController {
  constructor(private readonly erpDiscussionService: ErpDiscussionService) {}

  @Post('get-or-create')
  @RequirePermission('chat:create')
  async getOrCreateDiscussion(
    @Body()
    body: {
      entityType: string;
      entityId: string;
      entityName?: string;
      participantUserIds?: number[];
      initialContextNote?: string;
    },
    @CurrentUser() user: any,
  ) {
    return this.erpDiscussionService.getOrCreateDiscussion(
      body,
      user,
    );
  }

  @Get(':entityType/:entityId')
  @RequirePermission('chat:read')
  async getDiscussion(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @CurrentUser() user: any,
  ) {
    return this.erpDiscussionService.getOrCreateDiscussion(
      { entityType, entityId },
      user,
    );
  }
}
