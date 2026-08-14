import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ComplianceRetentionService } from '../services/compliance-retention.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConversationGuard } from '../guards/conversation.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('chat')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceRetentionService) {}

  @Get('conversations/:conversationId/export')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:moderate')
  async exportConversation(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @CurrentUser() user: any,
  ) {
    return this.complianceService.exportTranscript(conversationId, user.companyId, user);
  }

  @Post('compliance/retention/execute')
  @RequirePermission('chat:moderate')
  async executeRetention(@CurrentUser() user: any) {
    return this.complianceService.executeRetentionCleanup(user.companyId);
  }
}
