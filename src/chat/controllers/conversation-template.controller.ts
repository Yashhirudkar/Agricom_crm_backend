import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ConversationTemplateService } from '../services/conversation-template.service';
import { ChatBootstrapService } from '../services/chat-bootstrap.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('chat')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ConversationTemplateController {
  constructor(
    private readonly templateService: ConversationTemplateService,
    private readonly bootstrapService: ChatBootstrapService,
  ) {}

  @Post('bootstrap/provision')
  @RequirePermission('chat:moderate')
  async bootstrapCompany(@CurrentUser() user: any) {
    return this.bootstrapService.bootstrapCompanyChannels(user.companyId, user.id);
  }

  @Get('templates')
  @RequirePermission('chat:read')
  async getTemplates(@CurrentUser() user: any) {
    return this.templateService.getTemplates(user.companyId);
  }

  @Post('templates')
  @RequirePermission('chat:moderate')
  async createTemplate(
    @Body()
    body: {
      name: string;
      type: string;
      description?: string;
      defaultSettings?: any;
    },
    @CurrentUser() user: any,
  ) {
    return this.templateService.createTemplate({
      ...body,
      companyId: user.companyId,
    });
  }

  @Delete('templates/:id')
  @RequirePermission('chat:moderate')
  async deleteTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.templateService.deleteTemplate(id);
  }
}
