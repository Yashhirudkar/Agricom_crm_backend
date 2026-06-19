const fs = require('fs');
const file = 'src/hrms/services/leave-requests.service.ts';
let code = fs.readFileSync(file, 'utf8');

// 1. Add imports
code = code.replace(
  "import { StorageService } from './storage.service';",
  "import { StorageService } from './storage.service';\nimport { LeaveRequestsWorkflowService } from './leave-requests-workflow.service';\nimport { LeaveRequestsQueryService } from './leave-requests-query.service';"
);

// 2. Add to constructor
code = code.replace(
  "private readonly attendanceGateway: AttendanceGateway,\n  ) {}",
  "private readonly attendanceGateway: AttendanceGateway,\n    private readonly workflowService: LeaveRequestsWorkflowService,\n    private readonly queryService: LeaveRequestsQueryService,\n  ) {}"
);

// 3. Replace methods starting from approveLeave
const approveStart = code.indexOf('  async approveLeave');
if (approveStart === -1) {
  console.log("Could not find approveStart");
  process.exit(1);
}

const facade = `  async approveLeave(requestId: number, companyId: number, approverId: number, dto: ApproveLeaveDto, actor?: any): Promise<{ message: string }> {
    return this.workflowService.approveLeave(requestId, companyId, approverId, dto, actor);
  }

  async rejectLeave(requestId: number, companyId: number, approverId: number, dto: RejectLeaveDto, actor?: any): Promise<{ message: string }> {
    return this.workflowService.rejectLeave(requestId, companyId, approverId, dto, actor);
  }

  async cancelLeave(requestId: number, companyId: number, employeeId: number, dto: CancelLeaveDto, actor?: any): Promise<{ message: string }> {
    return this.workflowService.cancelLeave(requestId, companyId, employeeId, dto, actor);
  }

  async getLeaveRequests(companyId: number, query: GetLeaveRequestsFilterDto): Promise<LeaveRequest[]> {
    return this.queryService.getLeaveRequests(companyId, query);
  }

  async getLeaveRequestById(id: number, companyId: number): Promise<LeaveRequest> {
    return this.queryService.getLeaveRequestById(id, companyId);
  }

  async getDashboardSummary(companyId: number, employeeId: number): Promise<any> {
    return this.queryService.getDashboardSummary(companyId, employeeId);
  }
}
`;

code = code.substring(0, approveStart) + facade;
fs.writeFileSync(file, code);
console.log('Done rewriting leave-requests.service.ts!');
