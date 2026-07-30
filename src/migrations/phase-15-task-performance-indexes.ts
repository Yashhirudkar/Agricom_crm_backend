import { QueryInterface } from 'sequelize';

export const phase = '15';
export const name = 'Add Task Performance Indexes';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // 1. Composite index for client cursor-based query sorted by createdAt DESC, id DESC
  await queryInterface.addIndex(
    'tasks',
    ['clientId', 'createdAt', 'id'],
    { name: 'tasks_client_created_at_composite' }
  ).catch(() => {});

  // 2. Composite index for client, status, and creation sorting
  await queryInterface.addIndex(
    'tasks',
    ['clientId', 'statusId', 'createdAt'],
    { name: 'tasks_client_status_created_at' }
  ).catch(() => {});

  // 3. Performance index for owner filtering
  await queryInterface.addIndex(
    'tasks',
    ['clientId', 'ownerId'],
    { name: 'tasks_client_owner' }
  ).catch(() => {});

  // 4. Performance index for due date filtering
  await queryInterface.addIndex(
    'tasks',
    ['clientId', 'dueDate'],
    { name: 'tasks_client_due_date' }
  ).catch(() => {});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex('tasks', 'tasks_client_created_at_composite').catch(() => {});
  await queryInterface.removeIndex('tasks', 'tasks_client_status_created_at').catch(() => {});
  await queryInterface.removeIndex('tasks', 'tasks_client_owner').catch(() => {});
  await queryInterface.removeIndex('tasks', 'tasks_client_due_date').catch(() => {});
}
