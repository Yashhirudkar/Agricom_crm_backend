import { QueryInterface } from 'sequelize';

export const phase = '82';
export const name = 'create permission groups tables and seed functional groups';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    const seq = queryInterface.sequelize;

    // 1. Create permission_groups table
    await seq.query(
      `CREATE TABLE IF NOT EXISTS permission_groups (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        slug VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        icon VARCHAR(50),
        color VARCHAR(50),
        sort_order INTEGER DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );`,
      { transaction },
    );

    // 2. Create permission_group_modules join table
    await seq.query(
      `CREATE TABLE IF NOT EXISTS permission_group_modules (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES permission_groups(id) ON DELETE CASCADE,
        module_id INTEGER NOT NULL REFERENCES app_modules(id) ON DELETE CASCADE,
        sort_order INTEGER DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT uq_group_module UNIQUE (group_id, module_id)
      );`,
      { transaction },
    );

    // 3. Create role_permission_groups join table
    await seq.query(
      `CREATE TABLE IF NOT EXISTS role_permission_groups (
        id SERIAL PRIMARY KEY,
        role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        group_id INTEGER NOT NULL REFERENCES permission_groups(id) ON DELETE CASCADE,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT uq_role_group UNIQUE (role_id, group_id)
      );`,
      { transaction },
    );

    // 4. Seed standard Enterprise Permission Groups
    const groups = [
      {
        name: 'Administration',
        slug: 'administration',
        description: 'System administration, company setup, user management, and security roles',
        icon: 'Shield',
        color: 'purple',
        sort_order: 1,
        modules: ['Roles', 'Users', 'Companies', 'Clients', 'System'],
      },
      {
        name: 'Leave Management',
        slug: 'leave_management',
        description: 'Employee leaves, leave applications, approvals, and leave types',
        icon: 'CalendarCheck',
        color: 'emerald',
        sort_order: 2,
        modules: ['Leaves', 'Leave Types'],
      },
      {
        name: 'Attendance',
        slug: 'attendance',
        description: 'Time tracking, biometric devices, shifts, corrections, and reports',
        icon: 'Clock',
        color: 'amber',
        sort_order: 3,
        modules: ['Attendance'],
      },
      {
        name: 'HR Management',
        slug: 'hr_management',
        description: 'Employees, departments, designations, branches, and HR policies',
        icon: 'Users',
        color: 'blue',
        sort_order: 4,
        modules: ['Employees', 'Departments', 'Designations', 'Branches', 'HR Policy'],
      },
      {
        name: 'Sales',
        slug: 'sales',
        description: 'Sales contracts, shipments, purchase contracts, cargo availability, and stock',
        icon: 'FileCheck',
        color: 'indigo',
        sort_order: 5,
        modules: ['Sales Contract', 'Shipments', 'Purchase-contracts', 'Cargo Availability', 'Stock Management', 'Quotation'],
      },
      {
        name: 'Enquiries & Orders',
        slug: 'enquiries_orders',
        description: 'Customer enquiries, sales follow-ups, and confirmed orders',
        icon: 'MessageSquare',
        color: 'cyan',
        sort_order: 6,
        modules: ['Enquiry', 'Follow Up', 'Confirmed Orders'],
      },
      {
        name: 'Logistics',
        slug: 'logistics',
        description: 'Transport management, freight negotiations, and monthly stock summary',
        icon: 'Truck',
        color: 'orange',
        sort_order: 7,
        modules: ['Logistics'],
      },
      {
        name: 'Masters',
        slug: 'masters',
        description: 'Global products, categories, packaging specs, shipping lines, ports, and terms',
        icon: 'Database',
        color: 'teal',
        sort_order: 8,
        modules: [
          'Category', 'Product', 'Country', 'Hscode', 'Partnerrole', 'Partner',
          'Partner Dynamic Schema', 'Bagspec', 'Shipment-type', 'Payment-term',
          'Trade-document', 'Exchange Rates', 'Financial Year', 'Port Master',
          'Shipping Lines', 'Notification',
        ],
      },
      {
        name: 'Reports',
        slug: 'reports',
        description: 'Executive sales analytics, performance summaries, and export tools',
        icon: 'BarChart3',
        color: 'rose',
        sort_order: 9,
        modules: ['Sales Report'],
      },
      {
        name: 'Documents',
        slug: 'documents',
        description: 'Stuffing execution records, commercial invoices, and file attachments',
        icon: 'FileText',
        color: 'slate',
        sort_order: 10,
        modules: ['Documents', 'Attachments'],
      },
      {
        name: 'Collaboration & Tasks',
        slug: 'collaboration_tasks',
        description: 'Internal team chat, tasks, and company holidays calendar',
        icon: 'Briefcase',
        color: 'violet',
        sort_order: 11,
        modules: ['Chat', 'Task', 'Holidays'],
      },
    ];

    for (const grp of groups) {
      await seq.query(
        `INSERT INTO permission_groups (name, slug, description, icon, color, sort_order, "createdAt", "updatedAt")
         VALUES (:name, :slug, :description, :icon, :color, :sort_order, NOW(), NOW())
         ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name,
             description = EXCLUDED.description,
             icon = EXCLUDED.icon,
             color = EXCLUDED.color,
             sort_order = EXCLUDED.sort_order,
             "updatedAt" = NOW();`,
        {
          replacements: {
            name: grp.name,
            slug: grp.slug,
            description: grp.description,
            icon: grp.icon,
            color: grp.color,
            sort_order: grp.sort_order,
          },
          transaction,
        },
      );

      const [groupRecord]: any[] = await seq.query(
        `SELECT id FROM permission_groups WHERE slug = :slug LIMIT 1;`,
        { replacements: { slug: grp.slug }, type: 'SELECT', transaction },
      );

      if (groupRecord?.id) {
        for (let mIdx = 0; mIdx < grp.modules.length; mIdx++) {
          const modName = grp.modules[mIdx];
          const [appMod]: any[] = await seq.query(
            `SELECT id FROM app_modules WHERE LOWER(name) = LOWER(:modName) LIMIT 1;`,
            { replacements: { modName }, type: 'SELECT', transaction },
          );

          if (appMod?.id) {
            await seq.query(
              `INSERT INTO permission_group_modules (group_id, module_id, sort_order, "createdAt", "updatedAt")
               VALUES (:groupId, :moduleId, :sortOrder, NOW(), NOW())
               ON CONFLICT (group_id, module_id) DO UPDATE
               SET sort_order = EXCLUDED.sort_order,
                   "updatedAt" = NOW();`,
              {
                replacements: {
                  groupId: groupRecord.id,
                  moduleId: appMod.id,
                  sortOrder: mIdx * 10,
                },
                transaction,
              },
            );
          }
        }
      }
    }

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS role_permission_groups CASCADE;', { transaction });
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS permission_group_modules CASCADE;', { transaction });
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS permission_groups CASCADE;', { transaction });
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

