import { QueryInterface } from 'sequelize';

export const phase = '85';
export const name = 'replace loading points with transport details';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    // 1. Create transport_details table
    await queryInterface.sequelize.query(
      `CREATE TABLE IF NOT EXISTS transport_details (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id INTEGER,
        enquiry_id UUID REFERENCES enquiries(id) ON DELETE CASCADE,
        sales_contract_id INTEGER REFERENCES sales_contracts(id) ON DELETE CASCADE,
        parent_id VARCHAR(100),
        sequence INTEGER NOT NULL DEFAULT 1,
        origin VARCHAR(255) NOT NULL,
        incoterm VARCHAR(100) NOT NULL,
        destination VARCHAR(255) NOT NULL,
        freight_required BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,
      { transaction },
    );

    // 2. Indexes for transport_details
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_transport_details_enquiry_id ON transport_details(enquiry_id);
       CREATE INDEX IF NOT EXISTS idx_transport_details_sales_contract_id ON transport_details(sales_contract_id);
       CREATE INDEX IF NOT EXISTS idx_transport_details_parent_id ON transport_details(parent_id);
       CREATE INDEX IF NOT EXISTS idx_transport_details_company_id ON transport_details(company_id);`,
      { transaction },
    );

    // 3. Add origin column to freight_quotes if not exists
    await queryInterface.sequelize.query(
      `ALTER TABLE freight_quotes ADD COLUMN IF NOT EXISTS origin VARCHAR(255);`,
      { transaction },
    );

    // Copy loading_point to origin if loading_point exists
    try {
      await queryInterface.sequelize.query(
        `UPDATE freight_quotes 
         SET origin = loading_point 
         WHERE origin IS NULL AND loading_point IS NOT NULL;`,
        { transaction },
      );
    } catch {
      // Ignore if loading_point doesn't exist
    }

    // 4. Migrate existing Enquiries data into transport_details
    // 4a. Enquiries with destinations in enquiry_destinations
    await queryInterface.sequelize.query(
      `INSERT INTO transport_details (
        id, company_id, enquiry_id, parent_id, sequence, origin, incoterm, destination, freight_required, created_at, updated_at
      )
      SELECT 
        gen_random_uuid(),
        e.company_id,
        e.id,
        e.id::text,
        ROW_NUMBER() OVER (PARTITION BY e.id ORDER BY ed.created_at ASC),
        COALESCE(NULLIF(e.origin_port, ''), NULLIF(e.origin_city, ''), 'Origin'),
        COALESCE(NULLIF(e.shipment_type, ''), 'FOB'),
        ed.destination,
        CASE 
          WHEN UPPER(COALESCE(e.shipment_type, '')) ~* '^(CFR|CNF|CIF|CPT|CIP|DAP|DPU|DDP)' THEN true 
          ELSE false 
        END,
        NOW(),
        NOW()
      FROM enquiries e
      JOIN enquiry_destinations ed ON ed.enquiry_id = e.id
      WHERE NOT EXISTS (SELECT 1 FROM transport_details td WHERE td.enquiry_id = e.id);`,
      { transaction },
    );

    // 4b. Enquiries without enquiry_destinations rows but with destinationPort / destinationCity
    await queryInterface.sequelize.query(
      `INSERT INTO transport_details (
        id, company_id, enquiry_id, parent_id, sequence, origin, incoterm, destination, freight_required, created_at, updated_at
      )
      SELECT 
        gen_random_uuid(),
        e.company_id,
        e.id,
        e.id::text,
        1,
        COALESCE(NULLIF(e.origin_port, ''), NULLIF(e.origin_city, ''), 'Origin'),
        COALESCE(NULLIF(e.shipment_type, ''), 'FOB'),
        COALESCE(NULLIF(e.destination_country, ''), NULLIF(e.destination_port, ''), NULLIF(e.destination_city, ''), 'Destination'),
        CASE 
          WHEN UPPER(COALESCE(e.shipment_type, '')) ~* '^(CFR|CNF|CIF|CPT|CIP|DAP|DPU|DDP)' THEN true 
          ELSE false 
        END,
        NOW(),
        NOW()
      FROM enquiries e
      WHERE (NULLIF(e.destination_country, '') IS NOT NULL OR NULLIF(e.destination_port, '') IS NOT NULL OR NULLIF(e.destination_city, '') IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM transport_details td WHERE td.enquiry_id = e.id);`,
      { transaction },
    );

    // 5. Migrate existing Sales Contracts into transport_details
    await queryInterface.sequelize.query(
      `INSERT INTO transport_details (
        id, company_id, sales_contract_id, parent_id, sequence, origin, incoterm, destination, freight_required, created_at, updated_at
      )
      SELECT 
        gen_random_uuid(),
        sc.company_id,
        sc.id,
        sc.id::text,
        1,
        COALESCE(NULLIF(sc.origin_location_name, ''), NULLIF(sc.port_of_loading, ''), NULLIF(sc.origin_country, ''), 'Origin'),
        COALESCE(NULLIF(st.code, ''), NULLIF(st.name, ''), 'FOB'),
        COALESCE(NULLIF(sc.destination_location_name, ''), NULLIF(sc.port_of_discharge, ''), NULLIF(sc.enquiry_destination, ''), 'Destination'),
        CASE 
          WHEN UPPER(COALESCE(st.code, st.name, '')) ~* '^(CFR|CNF|CIF|CPT|CIP|DAP|DPU|DDP)' THEN true 
          ELSE false 
        END,
        NOW(),
        NOW()
      FROM sales_contracts sc
      LEFT JOIN shipment_types st ON sc.shipment_type_id = st.id
      WHERE NOT EXISTS (SELECT 1 FROM transport_details td WHERE td.sales_contract_id = sc.id);`,
      { transaction },
    );

    // 6. Safely drop enquiry_loading_points table
    await queryInterface.sequelize.query(
      `DROP TABLE IF EXISTS enquiry_loading_points CASCADE;`,
      { transaction },
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function down(_queryInterface: QueryInterface): Promise<void> {
  // Retain data for backward compatibility
}

