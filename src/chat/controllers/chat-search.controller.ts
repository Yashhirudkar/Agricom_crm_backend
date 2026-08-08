import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ChatSearchService } from '../services/chat-search.service';
import { ChatSearchDto } from '../dto/search.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('chat/search')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ChatSearchController {
  constructor(private readonly searchService: ChatSearchService) {}

  @Get('messages')
  @RequirePermission('chat:read')
  async searchMessages(
    @Query() dto: ChatSearchDto,
    @CurrentUser() user: any,
  ) {
    return this.searchService.searchMessages(user.companyId, user.id, user.type || '', dto);
  }

  @Get('conversations')
  @RequirePermission('chat:read')
  async searchConversations(
    @Query('q') query: string,
    @CurrentUser() user: any,
  ) {
    return this.searchService.searchConversations(user.companyId, user.id, user.type || '', query || '');
  }

  @Get('attachments')
  @RequirePermission('chat:read')
  async searchAttachments(
    @Query('q') query: string,
    @Query('mimeType') mimeType: string,
    @CurrentUser() user: any,
  ) {
    return this.searchService.searchAttachments(user.companyId, user.id, user.type || '', query, mimeType);
  }
}
