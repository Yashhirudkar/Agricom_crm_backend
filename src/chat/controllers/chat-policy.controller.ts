import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ChatPolicyService } from '../services/chat-policy.service';
import { ChatFeatureFlagService } from '../services/chat-feature-flag.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('chat')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ChatPolicyController {
  constructor(
    private readonly policyService: ChatPolicyService,
    private readonly flagService: ChatFeatureFlagService,
  ) {}

  @Get('policies')
  @RequirePermission('chat:read')
  async getPolicy(@CurrentUser() user: any) {
    return this.policyService.getCompanyPolicy(user.companyId);
  }

  @Put('policies')
  @RequirePermission('chat:moderate')
  async updatePolicy(
    @Body() dto: any,
    @CurrentUser() user: any,
  ) {
    return this.policyService.updateCompanyPolicy(user.companyId, dto);
  }

  @Get('feature-flags')
  @RequirePermission('chat:read')
  async getFlags(@CurrentUser() user: any) {
    return this.flagService.getAllFlags(user.companyId);
  }

  @Put('feature-flags/:key')
  @RequirePermission('chat:moderate')
  async setFlag(
    @Param('key') key: string,
    @Body() body: { isEnabled: boolean; description?: string },
    @CurrentUser() user: any,
  ) {
    return this.flagService.setFeatureFlag(user.companyId, key, body.isEnabled, body.description);
  }
}
