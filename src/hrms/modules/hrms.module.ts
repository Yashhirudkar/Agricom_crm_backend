import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Department } from '../../companies/models/department.model';
import { Designation } from '../models/designation.model';
import { Employee } from '../models/employee.model';
import { EmployeeDocument } from '../models/employee-document.model';
import { AuditModule } from '../../audit/modules/audit.module';
import { RbacModule } from '../../rbac/modules/rbac.module';
import { UsersModule } from '../../users/modules/users.module';

import { DepartmentsService } from '../services/departments.service';
import { DepartmentsController } from '../controllers/departments.controller';

import { DesignationsService } from '../services/designations.service';
import { DesignationsController } from '../controllers/designations.controller';

import { EmployeesService } from '../services/employees.service';
import { EmployeesController } from '../controllers/employees.controller';

@Module({
  imports: [
    SequelizeModule.forFeature([Department, Designation, Employee, EmployeeDocument]),
    AuditModule,
    RbacModule,
    UsersModule,
  ],
  providers: [DepartmentsService, DesignationsService, EmployeesService],
  controllers: [DepartmentsController, DesignationsController, EmployeesController],
  exports: [DepartmentsService, DesignationsService, EmployeesService],
})
export class HrmsModule {}
