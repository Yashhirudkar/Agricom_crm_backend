import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '17';
export const name = 'Add Attendance Reminder Preferences and Categories';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // 1. Add columns to user_preferences
  await queryInterface.addColumn('user_preferences', 'attendanceRemindersEnabled', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  }).catch(() => {});

  await queryInterface.addColumn('user_preferences', 'leaveNotificationsEnabled', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  }).catch(() => {});

  await queryInterface.addColumn('user_preferences', 'holidayNotificationsEnabled', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  }).catch(() => {});

  await queryInterface.addColumn('user_preferences', 'desktopNotificationsEnabled', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  }).catch(() => {});

  // 2. Add shiftId to departments
  await queryInterface.addColumn('departments', 'shiftId', {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'shifts', key: 'id' },
    onDelete: 'SET NULL',
  }).catch(() => {});

  // 3. Add category to notifications
  await queryInterface.addColumn('notifications', 'category', {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'SYSTEM',
  }).catch(() => {});

  // 4. Create sent_reminders table
  await queryInterface.createTable('sent_reminders', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
      onDelete: 'CASCADE',
    },
    employeeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'employees', key: 'id' },
      onDelete: 'CASCADE',
    },
    date: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    event: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  }).catch(() => {});

  // 5. Add unique index for sent_reminders to prevent duplicates
  await queryInterface.addIndex('sent_reminders', ['companyId', 'employeeId', 'date', 'event'], {
    unique: true,
    name: 'sent_reminders_unique_event',
  }).catch(() => {});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('sent_reminders').catch(() => {});
  await queryInterface.removeColumn('notifications', 'category').catch(() => {});
  await queryInterface.removeColumn('departments', 'shiftId').catch(() => {});
  await queryInterface.removeColumn('user_preferences', 'desktopNotificationsEnabled').catch(() => {});
  await queryInterface.removeColumn('user_preferences', 'holidayNotificationsEnabled').catch(() => {});
  await queryInterface.removeColumn('user_preferences', 'leaveNotificationsEnabled').catch(() => {});
  await queryInterface.removeColumn('user_preferences', 'attendanceRemindersEnabled').catch(() => {});
}
