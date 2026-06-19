const fs = require('fs');
const file = 'src/attendance/services/attendance.service.ts';
let code = fs.readFileSync(file, 'utf8');

// 1. Add import
code = code.replace(
  "import { AttendanceRegularizationService } from './attendance-regularization.service';",
  "import { AttendanceRegularizationService } from './attendance-regularization.service';\nimport { AttendanceExceptionsQueryService } from './attendance-exceptions-query.service';"
);

// 2. Add to constructor after regularizationService
code = code.replace(
  "private readonly regularizationService: AttendanceRegularizationService,\n  ) {}",
  "private readonly regularizationService: AttendanceRegularizationService,\n    private readonly exceptionsQueryService: AttendanceExceptionsQueryService,\n  ) {}"
);

// 3. Update facade delegates for the 2 methods
code = code.replace(
  `  async getPendingCorrections(companyId: number): Promise<AttendanceException[]> {
    return this.regularizationService.getPendingCorrections(companyId);
  }

  async getRegularizationHistory(companyId: number, query: any): Promise<any> {
    return this.regularizationService.getRegularizationHistory(companyId, query);
  }`,
  `  async getPendingCorrections(companyId: number): Promise<AttendanceException[]> {
    return this.exceptionsQueryService.getPendingCorrections(companyId);
  }

  async getRegularizationHistory(companyId: number, query: any): Promise<any> {
    return this.exceptionsQueryService.getRegularizationHistory(companyId, query);
  }`
);

fs.writeFileSync(file, code);
console.log('Done! Exceptions query service wired.');
