const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('postgres://postgres:admin@localhost:5432/Agricom_db1', {
  logging: false
});

async function run() {
  try {
    console.log('--- CHECKING ACTUAL CREATORS IN DB ---');

    const result = await sequelize.query(`
      SELECT
          sc.id,
          sc.created_by AS sales_contract_creator,
          e.created_by AS enquiry_creator,
          u1.name AS contract_creator_name,
          u2.name AS enquiry_creator_name
      FROM sales_contracts sc
      LEFT JOIN enquiries e ON e.id = sc.enquiry_id
      LEFT JOIN users u1 ON u1.id = sc.created_by
      LEFT JOIN users u2 ON u2.id = e.created_by
      WHERE sc.status NOT IN ('Draft', 'Cancelled');
    `, { type: Sequelize.QueryTypes.SELECT });

    console.table(result);

  } catch (error) {
    console.error('Error fetching data:', error);
  } finally {
    await sequelize.close();
  }
}

run();
