import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { PollService } from '../services/poll.service';
import { CreatePollDto, VotePollDto } from '../dto/poll.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConversationGuard } from '../guards/conversation.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('chat')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PollController {
  constructor(private readonly pollService: PollService) {}

  @Post('conversations/:conversationId/polls')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:create')
  async createPoll(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Body() dto: CreatePollDto,
    @CurrentUser() user: any,
  ) {
    return this.pollService.createPoll(conversationId, dto, user);
  }

  @Post('polls/:pollId/vote')
  @RequirePermission('chat:create')
  async vote(
    @Param('pollId', ParseIntPipe) pollId: number,
    @Body() dto: VotePollDto,
    @CurrentUser() user: any,
  ) {
    return this.pollService.vote(pollId, dto, user);
  }

  @Post('polls/:pollId/close')
  @RequirePermission('chat:moderate')
  async closePoll(
    @Param('pollId', ParseIntPipe) pollId: number,
    @CurrentUser() user: any,
  ) {
    return this.pollService.closePoll(pollId, user);
  }

  @Get('polls/:pollId')
  @RequirePermission('chat:read')
  async getPoll(
    @Param('pollId', ParseIntPipe) pollId: number,
    @CurrentUser() user: any,
  ) {
    return this.pollService.getPollDetails(pollId, user.id);
  }
}
