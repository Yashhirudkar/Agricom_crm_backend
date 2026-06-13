const { Sequelize } = require('sequelize');
const sequelize = new Sequelize('agricom', 'postgres', 'admin', {
  host: 'localhost',
  port: 5432,
  dialect: 'postgres',
  logging: false,
});
sequelize.query("SELECT id, email, \"firstName\" FROM \"Employees\"").then(res => {
  console.log("Employees:", res[0]);
  process.exit(0);
}).catch(console.error);
