import { sequelize } from './db-connection';
import { syncCore } from './sync-core';
import { syncRbac } from './sync-rbac';
import { syncSystem } from './sync-system';
import { syncHrms } from './sync-hrms';
import { syncAttendance } from './sync-attendance';
import { syncAuditLogsAndExtra } from './sync-audit-logs';

async function main() {
  try {
    console.log('Starting full database sync process...');

    // Wait for sequelize to authenticate
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    // run npm run sync in terminal
    // Sync in order to respect foreign key constraints
    await syncCore();
    await syncRbac();
    await syncSystem();
    await syncHrms();
    await syncAttendance();
    await syncAuditLogsAndExtra();

    console.log('All tables synced successfully!');
  } catch (error) {
    console.error('Error during synchronization:', error);
  } finally {
    await sequelize.close();
    console.log('Database connection closed.');
  }
}

main();
