import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '14';
export const name = 'Create Notifications Table';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'notifications',
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
      type: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      referenceType: {
        type: DataTypes.STRING(100),
        allowNull: false,
        field: 'referenceType',
      },
      referenceId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'referenceId',
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      payload: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      isRead: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'isRead',
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

  await queryInterface
    .addIndex('notifications', ['userId'], { name: 'notifications_user_id' })
    .catch(() => {});
  await queryInterface
    .addIndex('notifications', ['createdAt'], { name: 'notifications_created_at' })
    .catch(() => {});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('notifications').catch(() => {});
}
