import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '26';
export const name = 'Custom Locations — States & Cities';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ─── 1. custom_states ─────────────────────────────────────────────────────
  await queryInterface.createTable(
    'custom_states',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      countryCode: {
        type: DataTypes.STRING(10),
        allowNull: false,
        field: 'country_code',
      },
      countryName: {
        type: DataTypes.STRING(150),
        allowNull: false,
        field: 'country_name',
      },
      stateName: {
        type: DataTypes.STRING(150),
        allowNull: false,
        field: 'state_name',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'created_at',
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'updated_at',
      },
    },
    { ifNotExists: true } as any,
  );

  // Unique: one state name per country (case-insensitive via lower index)
  await queryInterface
    .addIndex('custom_states', ['country_code'], {
      name: 'custom_states_country_code_idx',
    })
    .catch(() => {});

  // ─── 2. custom_cities ─────────────────────────────────────────────────────
  await queryInterface.createTable(
    'custom_cities',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      countryCode: {
        type: DataTypes.STRING(10),
        allowNull: false,
        field: 'country_code',
      },
      countryName: {
        type: DataTypes.STRING(150),
        allowNull: false,
        field: 'country_name',
      },
      stateName: {
        type: DataTypes.STRING(150),
        allowNull: false,
        field: 'state_name',
      },
      cityName: {
        type: DataTypes.STRING(150),
        allowNull: false,
        field: 'city_name',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'created_at',
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'updated_at',
      },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface
    .addIndex('custom_cities', ['country_code', 'state_name'], {
      name: 'custom_cities_country_state_idx',
    })
    .catch(() => {});

  console.log(
    '✅ Phase 26 - Custom Locations (States & Cities) created successfully',
  );
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('custom_cities').catch(() => {});
  await queryInterface.dropTable('custom_states').catch(() => {});
  console.log('✅ Phase 26 - Custom Locations dropped');
}
