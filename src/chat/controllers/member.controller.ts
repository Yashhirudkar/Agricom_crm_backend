import {
  Controller,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { MemberService } from '../services/member.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { ConversationGuard } from '../guards/conversation.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { AddMemberDto, UpdateMemberRoleDto, MuteMemberDto } from '../dto/chat.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard, ConversationGuard)
@Controller('conversations/:conversationId/members')
export class MemberController {
  constructor(private readonly memberService: MemberService) {}

  private getCompanyId(req: any): number {
    const companyId = req.headers['x-company-id'] || req.activeCompanyId;
    if (!companyId) {
      throw new BadRequestException('x-company-id header is required');
    }
    return parseInt(companyId, 10);
  }

  private getActor(req: any) {
    return {
      userId: req.user.userId || req.user.id || null,
      clientId: req.user.clientId || null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      type: req.user.type || null,
    };
  }

  @Post()
  @RequirePermission('chat:moderate')
  addMember(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Body() dto: AddMemberDto,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.memberService.addMember(conversationId, companyId, dto, actor);
  }

  @Delete(':userId')
  @RequirePermission('chat:moderate')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    await this.memberService.removeMember(conversationId, companyId, userId, actor);
  }

  @Put(':userId/role')
  @RequirePermission('chat:moderate')
  updateRole(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateMemberRoleDto,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.memberService.updateRole(conversationId, companyId, userId, dto, actor);
  }

  @Post(':userId/mute')
  @RequirePermission('chat:moderate')
  muteMember(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: MuteMemberDto,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.memberService.muteMember(conversationId, companyId, userId, dto, actor);
  }
}
