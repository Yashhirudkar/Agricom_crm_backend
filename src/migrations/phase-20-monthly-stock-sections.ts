import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '20';
export const name = 'Monthly Stock Section Engine Tables';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;

  // 1. monthly_stock_sections Table
  await queryInterface.createTable(
    'monthly_stock_sections',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      monthly_stock_summary_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'monthly_stock_summaries', key: 'id' },
        onDelete: 'CASCADE',
      },
      section_name: { type: DataTypes.STRING(255), allowNull: false },
      display_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
      deleted_at: { type: DataTypes.DATE, allowNull: true },
    },
    { ifNotExists: true } as any,
  );

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_mss_sections_summary_id 
    ON monthly_stock_sections (monthly_stock_summary_id);
    ALTER TABLE monthly_stock_sections ADD COLUMN IF NOT EXISTS layout_x INT DEFAULT 0;
    ALTER TABLE monthly_stock_sections ADD COLUMN IF NOT EXISTS layout_y INT DEFAULT 0;
    ALTER TABLE monthly_stock_sections ADD COLUMN IF NOT EXISTS layout_width INT DEFAULT 12;
    ALTER TABLE monthly_stock_sections ADD COLUMN IF NOT EXISTS layout_height INT DEFAULT 1;
  `).catch(() => { });

  // 2. monthly_stock_section_columns Table
  await queryInterface.createTable(
    'monthly_stock_section_columns',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      section_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'monthly_stock_sections', key: 'id' },
        onDelete: 'CASCADE',
      },
      column_name: { type: DataTypes.STRING(255), allowNull: false },
      column_key: { type: DataTypes.STRING(100), allowNull: false },
      display_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { ifNotExists: true } as any,
  );

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_mss_columns_section_id 
    ON monthly_stock_section_columns (section_id);
  `).catch(() => { });

  // 3. monthly_stock_section_rows Table
  await queryInterface.createTable(
    'monthly_stock_section_rows',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      section_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'monthly_stock_sections', key: 'id' },
        onDelete: 'CASCADE',
      },
      row_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      is_total_row: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
      deleted_at: { type: DataTypes.DATE, allowNull: true },
    },
    { ifNotExists: true } as any,
  );

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_mss_rows_section_id 
    ON monthly_stock_section_rows (section_id);
  `).catch(() => { });

  // 4. monthly_stock_row_cells Table
  await queryInterface.createTable(
    'monthly_stock_row_cells',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      row_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'monthly_stock_section_rows', key: 'id' },
        onDelete: 'CASCADE',
      },
      column_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'monthly_stock_section_columns', key: 'id' },
        onDelete: 'CASCADE',
      },
      value: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { ifNotExists: true } as any,
  );

  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mss_row_column_unique 
    ON monthly_stock_row_cells (row_id, column_id);
  `).catch(() => { });

  console.log('✅ Phase 20 - Monthly Stock Section Engine created successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('monthly_stock_row_cells').catch(() => { });
  await queryInterface.dropTable('monthly_stock_section_rows').catch(() => { });
  await queryInterface.dropTable('monthly_stock_section_columns').catch(() => { });
  await queryInterface.dropTable('monthly_stock_sections').catch(() => { });

  console.log('✅ Phase 20 - Monthly Stock Section Engine reverted');
}
