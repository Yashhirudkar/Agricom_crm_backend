import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '10';
export const name = 'Enterprise Chat Platform Architecture (Conversations, Messages, Policies & Media)';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ─── 1. conversations ────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'conversations',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      clientId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'clientId',
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'companyId',
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: DataTypes.STRING(100), allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      avatarUrl: { type: DataTypes.TEXT, allowNull: true, field: 'avatarUrl' },
      type: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'GROUP' },
      entityType: { type: DataTypes.STRING(50), allowNull: true, field: 'entityType' },
      entityId: { type: DataTypes.STRING(100), allowNull: true, field: 'entityId' },
      isArchived: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isArchived' },
      isLocked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isLocked' },
      announcementMode: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'announcementMode' },
      posting_policy: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'ANYONE' },
      only_admins_can_post: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      visibility_policy: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'PUBLIC' },
      fileVisibility: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'PUBLIC', field: 'fileVisibility' },
      createdBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'createdBy',
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
      deletedAt: { type: DataTypes.DATE, allowNull: true, field: 'deletedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 2. conversation_settings ────────────────────────────────────────────────
  await queryInterface.createTable(
    'conversation_settings',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      conversationId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'conversationId',
        references: { model: 'conversations', key: 'id' },
        onDelete: 'CASCADE',
      },
      allowVoice: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'allowVoice' },
      allowVideo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'allowVideo' },
      allowGif: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'allowGif' },
      allowForward: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'allowForward' },
      allowReply: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'allowReply' },
      allowEdit: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'allowEdit' },
      allowDelete: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'allowDelete' },
      allowReaction: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'allowReaction' },
      allowPoll: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'allowPoll' },
      allowMention: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'allowMention' },
      allowExport: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'allowExport' },
      maxUploadSize: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 10485760, field: 'maxUploadSize' },
      retentionDays: { type: DataTypes.INTEGER, allowNull: true, field: 'retentionDays' },
      allowedMimeTypes: { type: DataTypes.JSONB, allowNull: true, field: 'allowedMimeTypes' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 3. conversation_members ─────────────────────────────────────────────────
  await queryInterface.createTable(
    'conversation_members',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      conversationId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'conversationId',
        references: { model: 'conversations', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'userId',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      role: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'MEMBER' },
      isMuted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isMuted' },
      isNotificationMuted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isNotificationMuted' },
      mutedUntil: { type: DataTypes.DATE, allowNull: true, field: 'mutedUntil' },
      lastReadMessageId: { type: DataTypes.INTEGER, allowNull: true, field: 'lastReadMessageId' },
      isPinned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isPinned' },
      isFavorite: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isFavorite' },
      isHidden: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isHidden' },
      unreadMessagesCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'unreadMessagesCount' },
      unreadMentionsCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'unreadMentionsCount' },
      unreadThreadsCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'unreadThreadsCount' },
      joinedAt: { type: DataTypes.DATE, allowNull: false, field: 'joinedAt' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 4. messages ─────────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'messages',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      conversationId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'conversationId',
        references: { model: 'conversations', key: 'id' },
        onDelete: 'CASCADE',
      },
      senderId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'senderId',
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      content: { type: DataTypes.TEXT, allowNull: true },
      type: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'TEXT' },
      payload: { type: DataTypes.JSONB, allowNull: true },
      isEdited: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isEdited' },
      version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      parentId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'parentId',
        references: { model: 'messages', key: 'id' },
        onDelete: 'CASCADE',
      },
      isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isDeleted' },
      deletedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'deletedBy',
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
      deletedAt: { type: DataTypes.DATE, allowNull: true, field: 'deletedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 5. message_reactions ────────────────────────────────────────────────────
  await queryInterface.createTable(
    'message_reactions',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      messageId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'messageId',
        references: { model: 'messages', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'userId',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      reaction: { type: DataTypes.STRING(50), allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 6. message_attachments ──────────────────────────────────────────────────
  await queryInterface.createTable(
    'message_attachments',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      messageId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'messageId',
        references: { model: 'messages', key: 'id' },
        onDelete: 'CASCADE',
      },
      attachmentId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'attachmentId',
        references: { model: 'attachments', key: 'id' },
        onDelete: 'CASCADE',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 7. message_mentions ─────────────────────────────────────────────────────
  await queryInterface.createTable(
    'message_mentions',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      messageId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'messageId',
        references: { model: 'messages', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'userId',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 8. message_read_states (with deletedAt) ─────────────────────────────────
  await queryInterface.createTable(
    'message_read_states',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'userId',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      messageId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'messageId',
        references: { model: 'messages', key: 'id' },
        onDelete: 'CASCADE',
      },
      isRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isRead' },
      readAt: { type: DataTypes.DATE, allowNull: true, field: 'readAt' },
      isStarred: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isStarred' },
      deletedAt: { type: DataTypes.DATE, allowNull: true, field: 'deletedAt' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 9. message_versions ─────────────────────────────────────────────────────
  await queryInterface.createTable(
    'message_versions',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      messageId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'messageId',
        references: { model: 'messages', key: 'id' },
        onDelete: 'CASCADE',
      },
      version: { type: DataTypes.INTEGER, allowNull: false },
      content: { type: DataTypes.TEXT, allowNull: true },
      payload: { type: DataTypes.JSONB, allowNull: true },
      editedBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'editedBy',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 10. message_pins ────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'message_pins',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      conversationId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'conversationId',
        references: { model: 'conversations', key: 'id' },
        onDelete: 'CASCADE',
      },
      messageId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'messageId',
        references: { model: 'messages', key: 'id' },
        onDelete: 'CASCADE',
      },
      pinnedBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'pinnedBy',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      pinnedAt: { type: DataTypes.DATE, allowNull: false, field: 'pinnedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 11. message_polls ───────────────────────────────────────────────────────
  await queryInterface.createTable(
    'message_polls',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      conversationId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'conversationId',
        references: { model: 'conversations', key: 'id' },
        onDelete: 'CASCADE',
      },
      messageId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'messageId',
        references: { model: 'messages', key: 'id' },
        onDelete: 'CASCADE',
      },
      question: { type: DataTypes.STRING(255), allowNull: false },
      isAnonymous: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isAnonymous' },
      allowMultiple: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'allowMultiple' },
      isClosed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isClosed' },
      closedAt: { type: DataTypes.DATE, allowNull: true, field: 'closedAt' },
      closedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'closedBy',
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      createdBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'createdBy',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 12. message_poll_options ────────────────────────────────────────────────
  await queryInterface.createTable(
    'message_poll_options',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      pollId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'pollId',
        references: { model: 'message_polls', key: 'id' },
        onDelete: 'CASCADE',
      },
      optionText: { type: DataTypes.STRING(255), allowNull: false, field: 'optionText' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 13. message_poll_votes ──────────────────────────────────────────────────
  await queryInterface.createTable(
    'message_poll_votes',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      pollId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'pollId',
        references: { model: 'message_polls', key: 'id' },
        onDelete: 'CASCADE',
      },
      optionId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'optionId',
        references: { model: 'message_poll_options', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'userId',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 14. conversation_drafts ─────────────────────────────────────────────────
  await queryInterface.createTable(
    'conversation_drafts',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      conversationId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'conversationId',
        references: { model: 'conversations', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'userId',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      content: { type: DataTypes.TEXT, allowNull: true },
      payload: { type: DataTypes.JSONB, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 15. conversation_labels ─────────────────────────────────────────────────
  await queryInterface.createTable(
    'conversation_labels',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'companyId',
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'userId',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: DataTypes.STRING(100), allowNull: false },
      color: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '#4F46E5' },
      scope: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'COMPANY' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 16. conversation_label_maps ─────────────────────────────────────────────
  await queryInterface.createTable(
    'conversation_label_maps',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      conversationId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'conversationId',
        references: { model: 'conversations', key: 'id' },
        onDelete: 'CASCADE',
      },
      labelId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'labelId',
        references: { model: 'conversation_labels', key: 'id' },
        onDelete: 'CASCADE',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 17. conversation_templates ──────────────────────────────────────────────
  await queryInterface.createTable(
    'conversation_templates',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'companyId',
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: DataTypes.STRING(100), allowNull: false },
      type: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'CHANNEL' },
      description: { type: DataTypes.TEXT, allowNull: true },
      defaultSettings: { type: DataTypes.JSONB, allowNull: true, field: 'defaultSettings' },
      isAutoProvisioned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isAutoProvisioned' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 18. chat_policies ───────────────────────────────────────────────────────
  await queryInterface.createTable(
    'chat_policies',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'companyId',
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      allowVoice: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'allowVoice' },
      allowVideo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'allowVideo' },
      allowGif: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'allowGif' },
      allowPoll: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'allowPoll' },
      allowExport: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'allowExport' },
      allowForward: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'allowForward' },
      allowMentionAll: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'allowMentionAll' },
      allowAiAssistant: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'allowAiAssistant' },
      maxUploadSize: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 104857600, field: 'maxUploadSize' },
      retentionDays: { type: DataTypes.INTEGER, allowNull: true, field: 'retentionDays' },
      legalHoldActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'legalHoldActive' },
      allowedMimeTypes: { type: DataTypes.JSONB, allowNull: true, field: 'allowedMimeTypes' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 19. chat_feature_flags ──────────────────────────────────────────────────
  await queryInterface.createTable(
    'chat_feature_flags',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'companyId',
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      featureKey: { type: DataTypes.STRING(100), allowNull: false, field: 'featureKey' },
      isEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isEnabled' },
      description: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 20. scheduled_messages ──────────────────────────────────────────────────
  await queryInterface.createTable(
    'scheduled_messages',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      conversationId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'conversationId',
        references: { model: 'conversations', key: 'id' },
        onDelete: 'CASCADE',
      },
      senderId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'senderId',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      content: { type: DataTypes.TEXT, allowNull: true },
      type: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'TEXT' },
      payload: { type: DataTypes.JSONB, allowNull: true },
      scheduledFor: { type: DataTypes.DATE, allowNull: false, field: 'scheduledFor' },
      isSent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isSent' },
      sentAt: { type: DataTypes.DATE, allowNull: true, field: 'sentAt' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // Indexes
  await queryInterface.addIndex('conversations', ['clientId'], { name: 'conversations_client_id' }).catch(() => { });
  await queryInterface.addIndex('conversations', ['companyId'], { name: 'conversations_company_id' }).catch(() => { });
  await queryInterface.addIndex('conversations', ['entityType', 'entityId'], { name: 'conversations_polymorphic_link' }).catch(() => { });
  await queryInterface.addIndex('conversation_members', ['conversationId', 'userId'], { unique: true, name: 'conversation_members_uniq' }).catch(() => { });
  await queryInterface.addIndex('messages', ['conversationId', 'createdAt'], { name: 'messages_conv_created' }).catch(() => { });
  await queryInterface.addIndex('message_reactions', ['messageId', 'userId', 'reaction'], { unique: true, name: 'message_reactions_uniq' }).catch(() => { });
  await queryInterface.addIndex('message_attachments', ['messageId', 'attachmentId'], { unique: true, name: 'message_attachments_uniq' }).catch(() => { });
  await queryInterface.addIndex('message_mentions', ['messageId', 'userId'], { unique: true, name: 'message_mentions_uniq' }).catch(() => { });
  await queryInterface.addIndex('message_read_states', ['userId', 'messageId'], { unique: true, name: 'message_read_states_uniq' }).catch(() => { });
  await queryInterface.addIndex('message_versions', ['messageId', 'version'], { name: 'msg_versions_msg_ver' }).catch(() => { });
  await queryInterface.addIndex('message_pins', ['conversationId', 'messageId'], { unique: true, name: 'msg_pins_conv_msg_uniq' }).catch(() => { });
  await queryInterface.addIndex('message_polls', ['conversationId'], { name: 'msg_polls_conv' }).catch(() => { });
  await queryInterface.addIndex('message_poll_votes', ['pollId', 'optionId', 'userId'], { unique: true, name: 'msg_poll_votes_uniq' }).catch(() => { });
  await queryInterface.addIndex('conversation_drafts', ['conversationId', 'userId'], { unique: true, name: 'conv_drafts_conv_user_uniq' }).catch(() => { });
  await queryInterface.addIndex('conversation_label_maps', ['conversationId', 'labelId'], { unique: true, name: 'conv_label_maps_uniq' }).catch(() => { });
  await queryInterface.addIndex('chat_feature_flags', ['companyId', 'featureKey'], { unique: true, name: 'chat_feature_flags_uniq' }).catch(() => { });
  await queryInterface.addIndex('scheduled_messages', ['scheduledFor', 'isSent'], { name: 'sched_messages_due' }).catch(() => { });

  console.log('✅ Phase 10 - Enterprise Chat Platform created successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('scheduled_messages').catch(() => { });
  await queryInterface.dropTable('chat_feature_flags').catch(() => { });
  await queryInterface.dropTable('chat_policies').catch(() => { });
  await queryInterface.dropTable('conversation_templates').catch(() => { });
  await queryInterface.dropTable('conversation_label_maps').catch(() => { });
  await queryInterface.dropTable('conversation_labels').catch(() => { });
  await queryInterface.dropTable('conversation_drafts').catch(() => { });
  await queryInterface.dropTable('message_poll_votes').catch(() => { });
  await queryInterface.dropTable('message_poll_options').catch(() => { });
  await queryInterface.dropTable('message_polls').catch(() => { });
  await queryInterface.dropTable('message_pins').catch(() => { });
  await queryInterface.dropTable('message_versions').catch(() => { });
  await queryInterface.dropTable('message_read_states').catch(() => { });
  await queryInterface.dropTable('message_mentions').catch(() => { });
  await queryInterface.dropTable('message_attachments').catch(() => { });
  await queryInterface.dropTable('message_reactions').catch(() => { });
  await queryInterface.dropTable('messages').catch(() => { });
  await queryInterface.dropTable('conversation_members').catch(() => { });
  await queryInterface.dropTable('conversation_settings').catch(() => { });
  await queryInterface.dropTable('conversations').catch(() => { });
  console.log('✅ Phase 10 - Enterprise Chat Platform dropped');
}
