import { Client } from '../clients/models/client.model';
import { Company } from '../companies/models/company.model';
import { Department } from '../companies/models/department.model';
import { CompanyHrPolicy } from '../companies/models/company-hr-policy.model';
import { User } from '../users/models/user.model';
import { UserSession } from '../users/models/user-session.model';
import { UserCompany } from '../users/models/user-company.model';
import { UserInvitation } from '../users/models/user-invitation.model';
import { UserPreference } from '../users/models/user-preference.model';
import { UserPasswordHistory } from '../users/models/user-password-history.model';
import { ProfileActivityLog } from '../profile/models/profile-activity-log.model';

export const syncCore = async () => {
  console.log('--- Syncing Core Models ---');
  await Client.sync({ alter: true });
  await Company.sync({ alter: true });
  await Department.sync({ alter: true });
  await CompanyHrPolicy.sync({ alter: true });
  await User.sync({ alter: true });
  await UserCompany.sync({ alter: true });
  await UserSession.sync({ alter: true });
  await UserInvitation.sync({ alter: true });
  await UserPreference.sync({ alter: true });
  await UserPasswordHistory.sync({ alter: true });
  await ProfileActivityLog.sync({ alter: true });
  console.log('--- Core Models Synced successfully ---');
};
