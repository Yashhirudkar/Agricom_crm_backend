/* eslint-disable */
// Temporary diagnostic script - delete after use
const { Sequelize } = require('sequelize');
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/agricom';
const seq = new Sequelize(dbUrl, { dialect: 'postgres', logging: false });

async function audit() {
  try {
    await seq.authenticate();
    console.log('\n========== COMPANY COUNTRY ==========');
    const [companies] = await seq.query('SELECT id, name, country FROM companies LIMIT 5');
    companies.forEach(c => {
      console.log(`  Company[${c.id}] "${c.name}"  country = ${JSON.stringify(c.country)}`);
    });

    console.log('\n========== ENQUIRY GEOGRAPHY FIELDS (last 15) ==========');
    const [enquiries] = await seq.query(`
      SELECT
        enquiry_no,
        shipment_mode,
        origin_country_id,
        destination_country,
        origin_state,
        origin_city,
        destination_state,
        destination_city
      FROM enquiries
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 15
    `);
    enquiries.forEach(e => {
      console.log(`  [${e.enquiry_no}] mode=${e.shipment_mode}`);
      console.log(`    origin_country_id   = ${JSON.stringify(e.origin_country_id)}`);
      console.log(`    destination_country = ${JSON.stringify(e.destination_country)}`);
      console.log(`    origin              = ${e.origin_city}, ${e.origin_state}`);
      console.log(`    destination         = ${e.destination_city}, ${e.destination_state}`);
    });

    console.log('\n========== CLASSIFICATION SIMULATION ==========');
    const [comps] = await seq.query(`SELECT country FROM companies LIMIT 1`);
    const companyCountry = comps[0]?.country;
    console.log(`  Company Country raw value: ${JSON.stringify(companyCountry)}`);
    const normCompany = companyCountry?.trim().toLowerCase();

    enquiries.forEach(e => {
      const normOrigin = e.origin_country_id?.trim().toLowerCase();
      const normDest = e.destination_country?.trim().toLowerCase();

      let classification;
      if (normOrigin === normCompany && normDest === normCompany) {
        classification = 'Domestic';
      } else if (normOrigin === normCompany && normDest !== normCompany) {
        classification = 'Export';
      } else if (normOrigin !== normCompany && normDest !== normCompany) {
        classification = 'Merchant Export';
      } else {
        classification = 'Unknown';
      }

      console.log(`  [${e.enquiry_no}] origin_id=${JSON.stringify(e.origin_country_id)} dest=${JSON.stringify(e.destination_country)} => ${classification}`);
    });

  } catch(e) {
    console.error('ERROR:', e.message);
  } finally {
    await seq.close();
  }
}

audit();
