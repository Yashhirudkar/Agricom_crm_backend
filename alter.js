const { Sequelize } = require('sequelize');
const sequelize = new Sequelize('agricom', 'postgres', 'admin', {
  host: 'localhost',
  port: 5432,
  dialect: 'postgres',
});

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Connected.');
    
    // Check if columns exist
    const [results] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='holidays' and column_name='isWeeklyOff';
    `);

    if (results.length === 0) {
      await sequelize.query(`ALTER TABLE holidays ADD COLUMN "isWeeklyOff" BOOLEAN DEFAULT false NOT NULL;`);
      await sequelize.query(`ALTER TABLE holidays ADD COLUMN "isHalfDay" BOOLEAN DEFAULT false NOT NULL;`);
      await sequelize.query(`ALTER TABLE holidays ADD COLUMN "halfDayStart" TIME;`);
      await sequelize.query(`ALTER TABLE holidays ADD COLUMN "halfDayEnd" TIME;`);
      console.log('Added columns.');
    } else {
      console.log('Columns already exist.');
    }
  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
}
run();
