import { AuditLog } from '../audit/models/audit-log.model';
import { SystemAuditLog } from '../system/models/system-audit-log.model';
import { Holiday } from '../holidays/models/holiday.model';
import { HolidayCompany } from '../holidays/models/holiday-company.model';

export const syncAuditLogsAndExtra = async () => {
  console.log('--- Syncing Audit Logs & Extra Models ---');
  await AuditLog.sync({ alter: true });
  await SystemAuditLog.sync({ alter: true });
  await Holiday.sync({ alter: true });
  await HolidayCompany.sync({ alter: true });
  console.log('--- Audit Logs & Extra Models Synced successfully ---');
};
