import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '21';
export const name = 'Create Chat Foundation Tables';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // 1. conversations table
  await queryInterface.createTable(
    'conversations',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
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
      name: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'GROUP',
      },
      entityType: {
        type: DataTypes.STRING(50),
        allowNull: true,
        field: 'entityType',
      },
      entityId: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'entityId',
      },
      isArchived: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'isArchived',
      },
      isLocked: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'isLocked',
      },
      announcementMode: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'announcementMode',
      },
      createdBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'createdBy',
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'createdAt',
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'updatedAt',
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'deletedAt',
      },
    },
    { ifNotExists: true } as any,
  );

  // 2. conversation_settings table
  await queryInterface.createTable(
    'conversation_settings',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      conversationId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'conversationId',
        references: { model: 'conversations', key: 'id' },
        onDelete: 'CASCADE',
      },
      allowVoice: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'allowVoice',
      },
      allowVideo: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'allowVideo',
      },
      allowGif: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'allowGif',
      },
      allowForward: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'allowForward',
      },
      allowReply: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'allowReply',
      },
      allowEdit: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'allowEdit',
      },
      allowDelete: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'allowDelete',
      },
      allowReaction: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'allowReaction',
      },
      allowPoll: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'allowPoll',
      },
      allowMention: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'allowMention',
      },
      allowExport: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'allowExport',
      },
      maxUploadSize: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 10485760,
        field: 'maxUploadSize',
      },
      retentionDays: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'retentionDays',
      },
      allowedMimeTypes: {
        type: DataTypes.JSONB,
        allowNull: true,
        field: 'allowedMimeTypes',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'createdAt',
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'updatedAt',
      },
    },
    { ifNotExists: true } as any,
  );

  // 3. conversation_members table
  await queryInterface.createTable(
    'conversation_members',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
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
      role: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'MEMBER',
      },
      isMuted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'isMuted',
      },
      mutedUntil: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'mutedUntil',
      },
      lastReadMessageId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'lastReadMessageId',
      },
      joinedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'joinedAt',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'createdAt',
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'updatedAt',
      },
    },
    { ifNotExists: true } as any,
  );

  // 4. messages table
  await queryInterface.createTable(
    'messages',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
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
      content: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'TEXT',
      },
      payload: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      isEdited: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'isEdited',
      },
      version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      parentId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'parentId',
        references: { model: 'messages', key: 'id' },
        onDelete: 'CASCADE',
      },
      isDeleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'isDeleted',
      },
      deletedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'deletedBy',
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'createdAt',
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'updatedAt',
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'deletedAt',
      },
    },
    { ifNotExists: true } as any,
  );

  // 5. message_reactions table
  await queryInterface.createTable(
    'message_reactions',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
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
      reaction: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'createdAt',
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'updatedAt',
      },
    },
    { ifNotExists: true } as any,
  );

  // 6. message_attachments table
  await queryInterface.createTable(
    'message_attachments',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
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
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'createdAt',
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'updatedAt',
      },
    },
    { ifNotExists: true } as any,
  );

  // 7. message_mentions table
  await queryInterface.createTable(
    'message_mentions',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
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
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'createdAt',
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'updatedAt',
      },
    },
    { ifNotExists: true } as any,
  );

  // 8. message_read_states table
  await queryInterface.createTable(
    'message_read_states',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
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
      isRead: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'isRead',
      },
      readAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'readAt',
      },
      isStarred: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'isStarred',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'createdAt',
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'updatedAt',
      },
    },
    { ifNotExists: true } as any,
  );

  // Create Indexes
  await queryInterface.addIndex('conversations', ['clientId'], { name: 'conversations_client_id' }).catch(() => {});
  await queryInterface.addIndex('conversations', ['companyId'], { name: 'conversations_company_id' }).catch(() => {});
  await queryInterface.addIndex('conversations', ['entityType', 'entityId'], { name: 'conversations_polymorphic_link' }).catch(() => {});
  await queryInterface.addIndex('conversation_members', ['conversationId', 'userId'], { unique: true, name: 'conversation_members_uniq' }).catch(() => {});
  await queryInterface.addIndex('messages', ['conversationId', 'createdAt'], { name: 'messages_conv_created' }).catch(() => {});
  await queryInterface.addIndex('message_reactions', ['messageId', 'userId', 'reaction'], { unique: true, name: 'message_reactions_uniq' }).catch(() => {});
  await queryInterface.addIndex('message_attachments', ['messageId', 'attachmentId'], { unique: true, name: 'message_attachments_uniq' }).catch(() => {});
  await queryInterface.addIndex('message_mentions', ['messageId', 'userId'], { unique: true, name: 'message_mentions_uniq' }).catch(() => {});
  await queryInterface.addIndex('message_read_states', ['userId', 'messageId'], { unique: true, name: 'message_read_states_uniq' }).catch(() => {});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('message_read_states').catch(() => {});
  await queryInterface.dropTable('message_mentions').catch(() => {});
  await queryInterface.dropTable('message_attachments').catch(() => {});
  await queryInterface.dropTable('message_reactions').catch(() => {});
  await queryInterface.dropTable('messages').catch(() => {});
  await queryInterface.dropTable('conversation_members').catch(() => {});
  await queryInterface.dropTable('conversation_settings').catch(() => {});
  await queryInterface.dropTable('conversations').catch(() => {});
}
