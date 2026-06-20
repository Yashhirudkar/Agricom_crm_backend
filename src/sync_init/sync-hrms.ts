import { Designation } from '../hrms/models/designation.model';
import { Branch } from '../hrms/models/branch.model';
import { Employee } from '../hrms/models/employee.model';
import { EmployeeDocument } from '../hrms/models/employee-document.model';
import { EmployeeLifecycleLog } from '../hrms/models/employee-lifecycle-log.model';
import { LeaveType } from '../hrms/models/leave-type.model';
import { EmployeeLeaveBalance } from '../hrms/models/employee-leave-balance.model';
import { LeaveBalanceHistory } from '../hrms/models/leave-balance-history.model';
import { LeaveRequest } from '../hrms/models/leave-request.model';
import { LeaveApprovalStep } from '../hrms/models/leave-approval-step.model';
import { LeaveApprovalLog } from '../hrms/models/leave-approval-log.model';

export const syncHrms = async () => {
  console.log('--- Syncing HRMS Models ---');
  await Designation.sync({ alter: true });
  await Branch.sync({ alter: true });
  await Employee.sync({ alter: true });
  await EmployeeDocument.sync({ alter: true });
  await EmployeeLifecycleLog.sync({ alter: true });
  await LeaveType.sync({ alter: true });
  await EmployeeLeaveBalance.sync({ alter: true });
  await LeaveBalanceHistory.sync({ alter: true });
  await LeaveRequest.sync({ alter: true });
  await LeaveApprovalStep.sync({ alter: true });
  await LeaveApprovalLog.sync({ alter: true });
  console.log('--- HRMS Models Synced successfully ---');
};
