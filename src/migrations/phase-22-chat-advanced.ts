import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '22';
export const name = 'Create Chat Advanced Tables and Extensions';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // 1. message_versions table
  await queryInterface.createTable(
    'message_versions',
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
      version: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      payload: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      editedBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'editedBy',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'createdAt',
      },
    },
    { ifNotExists: true } as any,
  );

  // 2. message_pins table
  await queryInterface.createTable(
    'message_pins',
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
      pinnedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'pinnedAt',
      },
    },
    { ifNotExists: true } as any,
  );

  // 3. message_polls table
  await queryInterface.createTable(
    'message_polls',
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
      messageId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'messageId',
        references: { model: 'messages', key: 'id' },
        onDelete: 'CASCADE',
      },
      question: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      isAnonymous: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'isAnonymous',
      },
      allowMultiple: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'allowMultiple',
      },
      isClosed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'isClosed',
      },
      closedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'closedAt',
      },
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

  // 4. message_poll_options table
  await queryInterface.createTable(
    'message_poll_options',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      pollId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'pollId',
        references: { model: 'message_polls', key: 'id' },
        onDelete: 'CASCADE',
      },
      optionText: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'optionText',
      },
    },
    { ifNotExists: true } as any,
  );

  // 5. message_poll_votes table
  await queryInterface.createTable(
    'message_poll_votes',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
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
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'createdAt',
      },
    },
    { ifNotExists: true } as any,
  );

  // 6. conversation_drafts table
  await queryInterface.createTable(
    'conversation_drafts',
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
      content: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      payload: {
        type: DataTypes.JSONB,
        allowNull: true,
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

  // 7. conversation_labels table
  await queryInterface.createTable(
    'conversation_labels',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
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
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      color: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: '#4F46E5',
      },
      scope: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'COMPANY',
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

  // 8. conversation_label_maps table
  await queryInterface.createTable(
    'conversation_label_maps',
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
      labelId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'labelId',
        references: { model: 'conversation_labels', key: 'id' },
        onDelete: 'CASCADE',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'createdAt',
      },
    },
    { ifNotExists: true } as any,
  );

  // 9. conversation_templates table
  await queryInterface.createTable(
    'conversation_templates',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
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
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'CHANNEL',
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      defaultSettings: {
        type: DataTypes.JSONB,
        allowNull: true,
        field: 'defaultSettings',
      },
      isAutoProvisioned: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'isAutoProvisioned',
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

  // 10. chat_policies table
  await queryInterface.createTable(
    'chat_policies',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'companyId',
        references: { model: 'companies', key: 'id' },
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
      allowPoll: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'allowPoll',
      },
      allowExport: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'allowExport',
      },
      allowForward: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'allowForward',
      },
      allowMentionAll: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'allowMentionAll',
      },
      allowAiAssistant: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'allowAiAssistant',
      },
      maxUploadSize: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 104857600,
        field: 'maxUploadSize',
      },
      retentionDays: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'retentionDays',
      },
      legalHoldActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'legalHoldActive',
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

  // 11. chat_feature_flags table
  await queryInterface.createTable(
    'chat_feature_flags',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'companyId',
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      featureKey: {
        type: DataTypes.STRING(100),
        allowNull: false,
        field: 'featureKey',
      },
      isEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'isEnabled',
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
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

  // 12. scheduled_messages table
  await queryInterface.createTable(
    'scheduled_messages',
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
        allowNull: false,
        field: 'senderId',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
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
      scheduledFor: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'scheduledFor',
      },
      isSent: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'isSent',
      },
      sentAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'sentAt',
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

  // 13. Add new columns to conversation_members table
  const columnsToAdd = [
    { name: 'isPinned', type: DataTypes.BOOLEAN, defaultValue: false },
    { name: 'isFavorite', type: DataTypes.BOOLEAN, defaultValue: false },
    { name: 'isHidden', type: DataTypes.BOOLEAN, defaultValue: false },
    { name: 'unreadMessagesCount', type: DataTypes.INTEGER, defaultValue: 0 },
    { name: 'unreadMentionsCount', type: DataTypes.INTEGER, defaultValue: 0 },
    { name: 'unreadThreadsCount', type: DataTypes.INTEGER, defaultValue: 0 },
  ];

  for (const col of columnsToAdd) {
    await queryInterface
      .addColumn('conversation_members', col.name, {
        type: col.type,
        allowNull: false,
        defaultValue: col.defaultValue,
      })
      .catch(() => {});
  }

  // 14. Indexes
  await queryInterface.addIndex('message_versions', ['messageId', 'version'], { name: 'msg_versions_msg_ver' }).catch(() => {});
  await queryInterface.addIndex('message_pins', ['conversationId', 'messageId'], { unique: true, name: 'msg_pins_conv_msg_uniq' }).catch(() => {});
  await queryInterface.addIndex('message_polls', ['conversationId'], { name: 'msg_polls_conv' }).catch(() => {});
  await queryInterface.addIndex('message_poll_votes', ['pollId', 'optionId', 'userId'], { unique: true, name: 'msg_poll_votes_uniq' }).catch(() => {});
  await queryInterface.addIndex('conversation_drafts', ['conversationId', 'userId'], { unique: true, name: 'conv_drafts_conv_user_uniq' }).catch(() => {});
  await queryInterface.addIndex('conversation_label_maps', ['conversationId', 'labelId'], { unique: true, name: 'conv_label_maps_uniq' }).catch(() => {});
  await queryInterface.addIndex('chat_feature_flags', ['companyId', 'featureKey'], { unique: true, name: 'chat_feature_flags_uniq' }).catch(() => {});
  await queryInterface.addIndex('scheduled_messages', ['scheduledFor', 'isSent'], { name: 'sched_messages_due' }).catch(() => {});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('scheduled_messages').catch(() => {});
  await queryInterface.dropTable('chat_feature_flags').catch(() => {});
  await queryInterface.dropTable('chat_policies').catch(() => {});
  await queryInterface.dropTable('conversation_templates').catch(() => {});
  await queryInterface.dropTable('conversation_label_maps').catch(() => {});
  await queryInterface.dropTable('conversation_labels').catch(() => {});
  await queryInterface.dropTable('conversation_drafts').catch(() => {});
  await queryInterface.dropTable('message_poll_votes').catch(() => {});
  await queryInterface.dropTable('message_poll_options').catch(() => {});
  await queryInterface.dropTable('message_polls').catch(() => {});
  await queryInterface.dropTable('message_pins').catch(() => {});
  await queryInterface.dropTable('message_versions').catch(() => {});

  const columnsToRemove = [
    'isPinned',
    'isFavorite',
    'isHidden',
    'unreadMessagesCount',
    'unreadMentionsCount',
    'unreadThreadsCount',
  ];

  for (const col of columnsToRemove) {
    await queryInterface.removeColumn('conversation_members', col).catch(() => {});
  }
}
