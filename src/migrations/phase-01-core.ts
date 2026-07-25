import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '01';
export const name = 'Core Tables (clients, users, companies, departments)';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ─── 1. clients ──────────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'clients',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING(255), allowNull: false },
      email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      password: { type: DataTypes.STRING(255), allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isActive' },
      status: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'Active' },
      allowedCompanies: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3, field: 'allowedCompanies' },
      allowedUsers: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 15, field: 'allowedUsers' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 2. users ────────────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'users',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING(255), allowNull: false },
      email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      password: { type: DataTypes.STRING(255), allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isActive' },
      avatarUrl: { type: DataTypes.STRING(1000), allowNull: true, field: 'avatarUrl' },
      clientId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'clientId',
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      status: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'Active' },
      lastLogin: { type: DataTypes.DATE, allowNull: true, field: 'lastLogin' },
      lastCompanyId: { type: DataTypes.INTEGER, allowNull: true, field: 'lastCompanyId' },
      companyId: { type: DataTypes.INTEGER, allowNull: true, field: 'companyId' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface.addIndex('users', ['clientId'], { name: 'users_client_id' }).catch(() => {});
  await queryInterface.addIndex('users', ['companyId'], { name: 'users_company_id' }).catch(() => {});

  // ─── 3. companies ─────────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'companies',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      clientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'clientId',
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: DataTypes.STRING(255), allowNull: false },
      legalName: { type: DataTypes.STRING(255), allowNull: true, field: 'legalName' },
      companyCode: { type: DataTypes.STRING(50), allowNull: true, unique: true, field: 'companyCode' },
      companyType: { type: DataTypes.STRING(100), allowNull: true, field: 'companyType' },
      industryType: { type: DataTypes.STRING(100), allowNull: true, field: 'industryType' },
      description: { type: DataTypes.TEXT, allowNull: true },
      registrationNumber: { type: DataTypes.STRING(100), allowNull: true, field: 'registration_number' },
      taxNumber: { type: DataTypes.STRING(100), allowNull: true, field: 'tax_number' },
      employeeCount: { type: DataTypes.INTEGER, allowNull: true, field: 'employee_count' },
      companySize: { type: DataTypes.STRING(50), allowNull: true, field: 'company_size' },
      logoUrl: { type: DataTypes.TEXT, allowNull: true, field: 'logoUrl' },
      faviconUrl: { type: DataTypes.TEXT, allowNull: true, field: 'faviconUrl' },
      email: { type: DataTypes.STRING(255), allowNull: true },
      phone: { type: DataTypes.STRING(30), allowNull: true },
      website: { type: DataTypes.STRING(255), allowNull: true },
      country: { type: DataTypes.STRING(100), allowNull: true },
      state: { type: DataTypes.STRING(100), allowNull: true },
      city: { type: DataTypes.STRING(100), allowNull: true },
      address: { type: DataTypes.TEXT, allowNull: true },
      pincode: { type: DataTypes.STRING(20), allowNull: true },
      establishedYear: { type: DataTypes.INTEGER, allowNull: true, field: 'established_year' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isActive' },
      status: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'Active' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // Add lastCompanyId FK after companies table exists
  await queryInterface
    .addConstraint('users', {
      fields: ['lastCompanyId'],
      type: 'foreign key',
      name: 'users_last_company_id_fk',
      references: { table: 'companies', field: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    } as any)
    .catch(() => {});

  // ─── 4. departments ──────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'departments',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'companyId',
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: DataTypes.STRING(255), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isActive' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  console.log('✅ Phase 01 - Core tables created successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('departments').catch(() => {});
  await queryInterface.dropTable('companies').catch(() => {});
  await queryInterface.dropTable('users').catch(() => {});
  await queryInterface.dropTable('clients').catch(() => {});
  console.log('✅ Phase 01 - Core tables dropped');
}

