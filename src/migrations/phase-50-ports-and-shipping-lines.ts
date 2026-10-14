import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '50';
export const name = 'ports-and-shipping-lines-master';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;
  const transaction = await sequelize.transaction();

  try {
    // ─── 1. ports ─────────────────────────────────────────────────────────────
    await queryInterface.createTable(
      'ports',
      {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        country_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: 'countries',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        port_name: {
          type: DataTypes.STRING(150),
          allowNull: false,
        },
        port_code: {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        unlocode: {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        port_type: {
          type: DataTypes.STRING(50),
          allowNull: false,
          defaultValue: 'SEA',
        },
        is_active: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: sequelize.fn('NOW'),
        },
        updated_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: sequelize.fn('NOW'),
        },
      },
      { transaction, ifNotExists: true } as any,
    );

    // Unique index on country_id + lower(port_name)
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_ports_country_port_name
       ON ports (country_id, LOWER(TRIM(port_name)))`,
      { transaction },
    );

    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_ports_country_id ON ports (country_id);
       CREATE INDEX IF NOT EXISTS idx_ports_port_type ON ports (port_type);
       CREATE INDEX IF NOT EXISTS idx_ports_unlocode ON ports (unlocode);
       CREATE INDEX IF NOT EXISTS idx_ports_is_active ON ports (is_active);`,
      { transaction },
    );

    // ─── 2. shipping_lines ────────────────────────────────────────────────────
    await queryInterface.createTable(
      'shipping_lines',
      {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        line_name: {
          type: DataTypes.STRING(150),
          allowNull: false,
        },
        line_code: {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        website: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        contact_email: {
          type: DataTypes.STRING(150),
          allowNull: true,
        },
        contact_phone: {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        is_active: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: sequelize.fn('NOW'),
        },
        updated_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: sequelize.fn('NOW'),
        },
      },
      { transaction, ifNotExists: true } as any,
    );

    // Unique index on lower(TRIM(line_name))
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_shipping_lines_name
       ON shipping_lines (LOWER(TRIM(line_name)))`,
      { transaction },
    );

    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_shipping_lines_is_active ON shipping_lines (is_active);
       CREATE INDEX IF NOT EXISTS idx_shipping_lines_line_code ON shipping_lines (line_code);`,
      { transaction },
    );

    // ─── 3. port_shipping_lines (Junction table) ──────────────────────────────
    await queryInterface.createTable(
      'port_shipping_lines',
      {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        port_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: 'ports',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        shipping_line_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: 'shipping_lines',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        is_active: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        remarks: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: sequelize.fn('NOW'),
        },
        updated_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: sequelize.fn('NOW'),
        },
      },
      { transaction, ifNotExists: true } as any,
    );

    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_port_shipping_lines_pair
       ON port_shipping_lines (port_id, shipping_line_id)`,
      { transaction },
    );

    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_psl_port_id ON port_shipping_lines (port_id);
       CREATE INDEX IF NOT EXISTS idx_psl_shipping_line_id ON port_shipping_lines (shipping_line_id);`,
      { transaction },
    );

    // ─── 4. Seed Standard Shipping Lines & Ports ──────────────────────────────
    const initialLines = [
      { name: 'MSC', code: 'MSCU', website: 'https://www.msc.com', email: 'info@msc.com' },
      { name: 'Maersk', code: 'MAEU', website: 'https://www.maersk.com', email: 'contact@maersk.com' },
      { name: 'CMA CGM', code: 'CMDU', website: 'https://www.cma-cgm.com', email: 'support@cma-cgm.com' },
      { name: 'ONE', code: 'ONEY', website: 'https://www.one-line.com', email: 'service@one-line.com' },
      { name: 'Hapag Lloyd', code: 'HLCU', website: 'https://www.hapag-lloyd.com', email: 'sales@hlag.com' },
      { name: 'COSCO', code: 'COSU', website: 'https://lines.coscoshipping.com', email: 'cs@coscon.com' },
      { name: 'EMC', code: 'EGLV', website: 'https://www.evergreen-marine.com', email: 'custserv@evergreen-marine.com' },
      { name: 'Yang Ming', code: 'YMLU', website: 'https://www.yangming.com', email: 'service@yangming.com' },
      { name: 'HMM', code: 'HDMU', website: 'https://www.hmm21.com', email: 'cs@hmm21.com' },
      { name: 'ZIM', code: 'ZIMU', website: 'https://www.zim.com', email: 'support@zim.com' },
    ];

    for (const l of initialLines) {
      await sequelize.query(
        `INSERT INTO shipping_lines (line_name, line_code, website, contact_email, is_active, created_at, updated_at)
         VALUES ('${l.name}', '${l.code}', '${l.website}', '${l.email}', true, NOW(), NOW())
         ON CONFLICT (LOWER(TRIM(line_name))) DO NOTHING;`,
        { transaction },
      );
    }

    // Resolve Country IDs for India and UAE
    const [indRows] = (await sequelize.query(
      `SELECT id FROM countries WHERE iso2_code = 'IN' OR LOWER(name) = 'india' LIMIT 1;`,
      { transaction },
    )) as any[];
    const [uaeRows] = (await sequelize.query(
      `SELECT id FROM countries WHERE iso2_code = 'AE' OR LOWER(name) = 'united arab emirates' LIMIT 1;`,
      { transaction },
    )) as any[];

    const indiaId = indRows?.[0]?.id;
    const uaeId = uaeRows?.[0]?.id;

    const initialPortMappings = [
      {
        countryId: indiaId,
        portName: 'Mumbai',
        portCode: 'BOM',
        unlocode: 'INBOM',
        portType: 'SEA',
        lines: ['MSC', 'Maersk', 'CMA CGM'],
      },
      {
        countryId: indiaId,
        portName: 'Mundra',
        portCode: 'MUN',
        unlocode: 'INMUN',
        portType: 'SEA',
        lines: ['MSC', 'ONE', 'Hapag Lloyd'],
      },
      {
        countryId: indiaId,
        portName: 'Chennai',
        portCode: 'MAA',
        unlocode: 'INMAA',
        portType: 'SEA',
        lines: ['Maersk', 'COSCO'],
      },
      {
        countryId: indiaId,
        portName: 'Nhava Sheva',
        portCode: 'NSA',
        unlocode: 'INNSA',
        portType: 'SEA',
        lines: ['MSC', 'Maersk', 'CMA CGM', 'ONE'],
      },
      {
        countryId: uaeId,
        portName: 'Jebel Ali',
        portCode: 'JEA',
        unlocode: 'AEJEA',
        portType: 'SEA',
        lines: ['MSC', 'COSCO', 'EMC'],
      },
      {
        countryId: uaeId,
        portName: 'Abu Dhabi',
        portCode: 'AUH',
        unlocode: 'AEAUH',
        portType: 'SEA',
        lines: ['ONE', 'Maersk'],
      },
    ];

    for (const p of initialPortMappings) {
      if (!p.countryId) continue;

      await sequelize.query(
        `INSERT INTO ports (country_id, port_name, port_code, unlocode, port_type, is_active, created_at, updated_at)
         VALUES (${p.countryId}, '${p.portName}', '${p.portCode}', '${p.unlocode}', '${p.portType}', true, NOW(), NOW())
         ON CONFLICT (country_id, LOWER(TRIM(port_name))) DO UPDATE SET unlocode = EXCLUDED.unlocode;`,
        { transaction },
      );

      const [pRow] = (await sequelize.query(
        `SELECT id FROM ports WHERE country_id = ${p.countryId} AND LOWER(TRIM(port_name)) = LOWER(TRIM('${p.portName}')) LIMIT 1;`,
        { transaction },
      )) as any[];

      const portId = pRow?.[0]?.id;
      if (portId) {
        for (const lineName of p.lines) {
          const [lRow] = (await sequelize.query(
            `SELECT id FROM shipping_lines WHERE LOWER(TRIM(line_name)) = LOWER(TRIM('${lineName}')) LIMIT 1;`,
            { transaction },
          )) as any[];
          const lineId = lRow?.[0]?.id;
          if (lineId) {
            await sequelize.query(
              `INSERT INTO port_shipping_lines (port_id, shipping_line_id, is_active, created_at, updated_at)
               VALUES (${portId}, ${lineId}, true, NOW(), NOW())
               ON CONFLICT (port_id, shipping_line_id) DO NOTHING;`,
              { transaction },
            );
          }
        }
      }
    }

    // ─── 5. Add Sidebar Items under Masters Folder ────────────────────────────
    const [mastersFolderRows] = (await sequelize.query(
      `SELECT id FROM sidebar_folders WHERE name = 'Masters' LIMIT 1;`,
      { transaction },
    )) as any[];

    const mastersFolderId = mastersFolderRows?.[0]?.id;
    if (mastersFolderId) {
      // Port Master
      await sequelize.query(
        `INSERT INTO sidebar_items (name, route, icon_name, folder_id, sort_order, is_active, permission_link, "createdAt", "updatedAt")
         SELECT 'Port Master', '/masters/ports', 'Anchor', ${mastersFolderId}, 85, true, 'masters:read', NOW(), NOW()
         WHERE NOT EXISTS (SELECT 1 FROM sidebar_items WHERE route = '/masters/ports');`,
        { transaction },
      );

      // Shipping Lines
      await sequelize.query(
        `INSERT INTO sidebar_items (name, route, icon_name, folder_id, sort_order, is_active, permission_link, "createdAt", "updatedAt")
         SELECT 'Shipping Lines', '/masters/shipping-lines', 'Ship', ${mastersFolderId}, 86, true, 'masters:read', NOW(), NOW()
         WHERE NOT EXISTS (SELECT 1 FROM sidebar_items WHERE route = '/masters/shipping-lines');`,
        { transaction },
      );

      // Grant client item access to existing clients
      await sequelize.query(
        `INSERT INTO client_item_access (client_id, item_id, is_active, "createdAt", "updatedAt")
         SELECT c.id, si.id, true, NOW(), NOW()
         FROM clients c
         CROSS JOIN sidebar_items si
         WHERE si.route IN ('/masters/ports', '/masters/shipping-lines')
           AND NOT EXISTS (
             SELECT 1 FROM client_item_access cia WHERE cia.client_id = c.id AND cia.item_id = si.id
           );`,
        { transaction },
      ).catch(() => {});
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;

  await sequelize.query(
    `DELETE FROM sidebar_items WHERE route IN ('/masters/ports', '/masters/shipping-lines');`,
  );
  await queryInterface.dropTable('port_shipping_lines').catch(() => {});
  await queryInterface.dropTable('shipping_lines').catch(() => {});
  await queryInterface.dropTable('ports').catch(() => {});
}
