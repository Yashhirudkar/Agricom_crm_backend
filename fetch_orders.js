const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('postgres://postgres:postgres@localhost:5432/agricom_crm_db', {
  logging: false
});

async function run() {
  try {
    const results = await sequelize.query(`
      SELECT contract_number, contract_date, total_quantity, total_amount, status 
      FROM sales_contracts 
      WHERE status NOT IN ('Draft', 'Cancelled')
    `, { type: Sequelize.QueryTypes.SELECT });
    console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    console.error('Error fetching data:', error);
  } finally {
    await sequelize.close();
  }
}

run();
