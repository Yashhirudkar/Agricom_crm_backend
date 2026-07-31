import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '16';
export const name = 'Add Attendance Leave Conflict Columns';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // 1. Alter type column in attendance_exceptions to be nullable
  await queryInterface.changeColumn('attendance_exceptions', 'type', {
    type: DataTypes.STRING(100),
    allowNull: true,
  }).catch(() => {});

  // 2. Alter status column in attendance_exceptions to restricted VARCHAR with CHECK constraint
  // This avoids PG transactional ALTER TYPE ADD VALUE limitations while keeping constraints strict
  await queryInterface.sequelize.query(`
    ALTER TABLE "attendance_exceptions" 
    ALTER COLUMN "status" TYPE VARCHAR(50),
    ALTER COLUMN "status" SET DEFAULT 'PENDING';
  `).catch(() => {});

  await queryInterface.sequelize.query(`
    ALTER TABLE "attendance_exceptions" 
    DROP CONSTRAINT IF EXISTS "attendance_exceptions_status_check";
  `).catch(() => {});

  await queryInterface.sequelize.query(`
    ALTER TABLE "attendance_exceptions" 
    ADD CONSTRAINT "attendance_exceptions_status_check" 
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'OPEN', 'UNDER_REVIEW', 'RESOLVED', 'CANCELLED'));
  `).catch(() => {});

  // 3. Add new columns to attendance_exceptions
  await queryInterface.addColumn('attendance_exceptions', 'companyId', {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'companies', key: 'id' },
    onDelete: 'CASCADE',
  }).catch(() => {});

  await queryInterface.addColumn('attendance_exceptions', 'attendanceId', {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'attendance_records', key: 'id' },
    onDelete: 'SET NULL',
  }).catch(() => {});

  await queryInterface.addColumn('attendance_exceptions', 'leaveId', {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'leave_requests', key: 'id' },
    onDelete: 'SET NULL',
  }).catch(() => {});

  await queryInterface.addColumn('attendance_exceptions', 'exceptionType', {
    type: DataTypes.STRING(100),
    allowNull: true,
  }).catch(() => {});

  await queryInterface.addColumn('attendance_exceptions', 'resolution', {
    type: DataTypes.STRING(255),
    allowNull: true,
  }).catch(() => {});

  await queryInterface.addColumn('attendance_exceptions', 'resolvedBy', {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL',
  }).catch(() => {});

  await queryInterface.addColumn('attendance_exceptions', 'resolvedAt', {
    type: DataTypes.DATE,
    allowNull: true,
  }).catch(() => {});

  await queryInterface.addColumn('attendance_exceptions', 'priority', {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'MEDIUM',
  }).catch(() => {});

  await queryInterface.sequelize.query(`
    ALTER TABLE "attendance_exceptions" 
    ADD CONSTRAINT "attendance_exceptions_priority_check" 
    CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH'));
  `).catch(() => {});

  await queryInterface.addColumn('attendance_exceptions', 'conflictRef', {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: true,
  }).catch(() => {});

  // 4. Add columns to attendance_records
  await queryInterface.addColumn('attendance_records', 'isConflict', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  }).catch(() => {});

  await queryInterface.addColumn('attendance_records', 'isIgnored', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  }).catch(() => {});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Revert columns on attendance_records
  await queryInterface.removeColumn('attendance_records', 'isIgnored').catch(() => {});
  await queryInterface.removeColumn('attendance_records', 'isConflict').catch(() => {});

  // Revert columns on attendance_exceptions
  await queryInterface.removeColumn('attendance_exceptions', 'conflictRef').catch(() => {});
  await queryInterface.sequelize.query('ALTER TABLE "attendance_exceptions" DROP CONSTRAINT IF EXISTS "attendance_exceptions_priority_check"').catch(() => {});
  await queryInterface.removeColumn('attendance_exceptions', 'priority').catch(() => {});
  await queryInterface.removeColumn('attendance_exceptions', 'resolvedAt').catch(() => {});
  await queryInterface.removeColumn('attendance_exceptions', 'resolvedBy').catch(() => {});
  await queryInterface.removeColumn('attendance_exceptions', 'resolution').catch(() => {});
  await queryInterface.removeColumn('attendance_exceptions', 'exceptionType').catch(() => {});
  await queryInterface.removeColumn('attendance_exceptions', 'leaveId').catch(() => {});
  await queryInterface.removeColumn('attendance_exceptions', 'attendanceId').catch(() => {});
  await queryInterface.removeColumn('attendance_exceptions', 'companyId').catch(() => {});
  await queryInterface.sequelize.query('ALTER TABLE "attendance_exceptions" DROP CONSTRAINT IF EXISTS "attendance_exceptions_status_check"').catch(() => {});
}
