import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RbacModule } from '../rbac/modules/rbac.module';
import { AuditModule } from '../audit/modules/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

// Chat Models
import {
  Conversation,
  ConversationSetting,
  ConversationMember,
  Message,
  MessageReaction,
  MessageAttachment,
  MessageMention,
  MessageReadState,
  MessageVersion,
  MessagePin,
  MessagePoll,
  MessagePollOption,
  MessagePollVote,
  ConversationDraft,
  ConversationLabel,
  ConversationLabelMap,
  ConversationTemplate,
  ChatPolicy,
  ChatFeatureFlag,
  ScheduledMessage,
} from './models';
import { Attachment } from '../attachments/models/attachment.model';
import { User } from '../users/models/user.model';
import { UserCompany } from '../users/models/user-company.model';

// Services
import { ConversationService } from './services/conversation.service';
import { MemberService } from './services/member.service';
import { MessageService } from './services/message.service';
import { ConversationSummaryService } from './services/conversation-summary.service';
import { ThreadService } from './services/thread.service';
import { MentionService } from './services/mention.service';
import { PollService } from './services/poll.service';
import { MessageExtraService } from './services/message-extra.service';
import { DatabaseSearchProvider } from './services/search/database-search.provider';
import { ChatSearchService } from './services/chat-search.service';
import { ErpDiscussionService } from './services/erp-discussion.service';
import { ConversationTemplateService } from './services/conversation-template.service';
import { ChatBootstrapService } from './services/chat-bootstrap.service';
import { UnreadService } from './services/unread.service';
import { ScheduledMessageService } from './services/scheduled-message.service';
import { ChatPolicyService } from './services/chat-policy.service';
import { ChatFeatureFlagService } from './services/chat-feature-flag.service';
import { ConversationAdminService } from './services/conversation-admin.service';
import { ChatAnalyticsService } from './services/chat-analytics.service';
import { ComplianceRetentionService } from './services/compliance-retention.service';

// Controllers
import { ConversationController } from './controllers/conversation.controller';
import { MemberController } from './controllers/member.controller';
import { MessageController } from './controllers/message.controller';
import { ThreadController } from './controllers/thread.controller';
import { PollController } from './controllers/poll.controller';
import { MessageExtraController } from './controllers/message-extra.controller';
import { ChatSearchController } from './controllers/chat-search.controller';
import { ErpDiscussionController } from './controllers/erp-discussion.controller';
import { ConversationTemplateController } from './controllers/conversation-template.controller';
import { UnreadController } from './controllers/unread.controller';
import { ScheduledMessageController } from './controllers/scheduled-message.controller';
import { ChatPolicyController } from './controllers/chat-policy.controller';
import { ConversationAdminController } from './controllers/conversation-admin.controller';
import { ChatAnalyticsController } from './controllers/chat-analytics.controller';
import { ComplianceController } from './controllers/compliance.controller';

// Gateways & Listeners
import { ChatGateway } from './gateways/chat.gateway';
import { ChatEventsListener } from './listeners/chat-events.listener';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Conversation,
      ConversationSetting,
      ConversationMember,
      Message,
      MessageReaction,
      MessageAttachment,
      MessageMention,
      MessageReadState,
      Attachment,
      User,
      UserCompany,
      MessageVersion,
      MessagePin,
      MessagePoll,
      MessagePollOption,
      MessagePollVote,
      ConversationDraft,
      ConversationLabel,
      ConversationLabelMap,
      ConversationTemplate,
      ChatPolicy,
      ChatFeatureFlag,
      ScheduledMessage,
    ]),
    RbacModule,
    AuditModule,
    NotificationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (configService.get<string>('JWT_ACCESS_EXPIRES') || '15m') as any,
        },
      }),
    }),
  ],
  controllers: [
    ConversationController,
    MemberController,
    MessageController,
    ThreadController,
    PollController,
    MessageExtraController,
    ChatSearchController,
    ErpDiscussionController,
    ConversationTemplateController,
    UnreadController,
    ScheduledMessageController,
    ChatPolicyController,
    ConversationAdminController,
    ChatAnalyticsController,
    ComplianceController,
  ],
  providers: [
    ConversationService,
    MemberService,
    MessageService,
    ConversationSummaryService,
    ThreadService,
    MentionService,
    PollService,
    MessageExtraService,
    DatabaseSearchProvider,
    ChatSearchService,
    ErpDiscussionService,
    ConversationTemplateService,
    ChatBootstrapService,
    UnreadService,
    ScheduledMessageService,
    ChatPolicyService,
    ChatFeatureFlagService,
    ConversationAdminService,
    ChatAnalyticsService,
    ComplianceRetentionService,
    ChatGateway,
    ChatEventsListener,
  ],
  exports: [
    SequelizeModule,
    ConversationService,
    MemberService,
    MessageService,
    ConversationSummaryService,
    ThreadService,
    MentionService,
    PollService,
    MessageExtraService,
    ChatSearchService,
    ErpDiscussionService,
    ConversationTemplateService,
    ChatBootstrapService,
    UnreadService,
    ScheduledMessageService,
    ChatPolicyService,
    ChatFeatureFlagService,
    ConversationAdminService,
    ChatAnalyticsService,
    ComplianceRetentionService,
    ChatGateway,
    ChatEventsListener,
  ],
})
export class ChatModule {}
