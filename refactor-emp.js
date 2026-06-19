const fs = require('fs');
const file = 'src/hrms/services/employees.service.ts';
let code = fs.readFileSync(file, 'utf8');

// 1. Add imports
code = code.replace(
  "import { StorageService } from './storage.service';",
  "import { StorageService } from './storage.service';\nimport { EmployeesOrgService } from './employees-org.service';\nimport { EmployeesDocumentService } from './employees-document.service';"
);

// 2. Add to constructor
code = code.replace(
  "private readonly storageService: StorageService,\n    private readonly eventEmitter: EventEmitter2,\n  ) {}",
  "private readonly storageService: StorageService,\n    private readonly eventEmitter: EventEmitter2,\n    private readonly orgService: EmployeesOrgService,\n    private readonly documentService: EmployeesDocumentService,\n  ) {}"
);

// 3. Update 'this.isCircularManager' in updateEmployee
code = code.replace(
  "const isCircular = await this.isCircularManager(employee.id, data.managerId, companyId);",
  "const isCircular = await this.orgService.isCircularManager(employee.id, data.managerId, companyId);"
);

// 4. Replace isCircularManager implementation
const isCircStart = code.indexOf('  private async isCircularManager');
const generateEmpCodeStart = code.indexOf('  private async generateEmployeeCode');
code = code.substring(0, isCircStart) + code.substring(generateEmpCodeStart);

// 5. Replace Org block and Document block with facade
const orgStart = code.indexOf('  // --- Organization Hierarchy ---');
if (orgStart === -1) {
  console.log("Could not find org start");
  process.exit(1);
}

const facade = `  // --- Organization Hierarchy ---

  async getOrgChart(companyId: number): Promise<any[]> {
    return this.orgService.getOrgChart(companyId);
  }

  async getTeam(managerId: number, companyId: number): Promise<Employee[]> {
    return this.orgService.getTeam(managerId, companyId);
  }

  async getAllSubordinates(managerId: number, companyId: number): Promise<any[]> {
    return this.orgService.getAllSubordinates(managerId, companyId);
  }

  async getReportingChain(employeeId: number, companyId: number): Promise<any[]> {
    return this.orgService.getReportingChain(employeeId, companyId);
  }

  async changeManager(employeeId: number, companyId: number, dto: any, actor: any): Promise<{ message: string }> {
    return this.orgService.changeManager(employeeId, companyId, dto, actor);
  }

  // --- Documents ---

  async addDocument(employeeId: number, companyId: number, data: any, file: Express.Multer.File, actor?: any): Promise<EmployeeDocument> {
    return this.documentService.addDocument(employeeId, companyId, data, file, actor);
  }

  async getDocuments(employeeId: number, companyId: number, actor?: any): Promise<EmployeeDocument[]> {
    return this.documentService.getDocuments(employeeId, companyId, actor);
  }

  async deleteDocument(employeeId: number, documentId: number, companyId: number, actor?: any): Promise<{ message: string }> {
    return this.documentService.deleteDocument(employeeId, documentId, companyId, actor);
  }

  async verifyDocument(employeeId: number, documentId: number, companyId: number, data: any, actor?: any): Promise<EmployeeDocument> {
    return this.documentService.verifyDocument(employeeId, documentId, companyId, data, actor);
  }

  async downloadDocument(employeeId: number, documentId: number, companyId: number, actor: any): Promise<string> {
    return this.documentService.downloadDocument(employeeId, documentId, companyId, actor);
  }
}
`;

code = code.substring(0, orgStart) + facade;
fs.writeFileSync(file, code);
console.log('Done rewriting employees.service.ts!');
