import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { LocalStorageProvider } from './services/local-storage.provider';

// Models
import {
  Task,
  TaskSequence,
  TaskStatus,
  TaskPriority,
  TaskAssignee,
  TaskActivity,
  TaskComment,
  TaskAttachment,
  TaskLabel,
  TaskLabelMap,
  TaskChecklist,
  TaskCustomField,
  TaskCustomFieldValue,
  TaskTimeLog,
  TaskDependency,
  TaskRecurrence,
  TaskRecurrenceException,
  TaskTemplate,
  TaskTemplateItem,
  TaskSlaRule,
  TaskStatusTransition,
  TaskCommentMention,
  TaskCommentHistory,
} from './models';
import { Employee } from '../hrms/models/employee.model';
import { User } from '../users/models/user.model';

// Repositories
import {
  TaskRepository,
  TaskQueryRepository,
  TaskActivityRepository,
  TaskCommentRepository,
  TaskAttachmentRepository,
} from './repositories';
import { TaskChecklistRepository } from './repositories/task-checklist.repository';
import { TaskDependencyRepository } from './repositories/task-dependency.repository';
import { TaskTimeLogRepository } from './repositories/task-time-log.repository';
import { TaskCustomFieldRepository } from './repositories/task-custom-field.repository';
import { TaskTemplateRepository } from './repositories/task-template.repository';
import { TaskStatusTransitionRepository } from './repositories/task-status-transition.repository';

// Services
import {
  TasksService,
  TaskActivityService,
  TaskCommentService,
  TaskAttachmentService,
  TaskHealthService,
  TaskDueDateService,
  TaskViewService,
} from './services';
import { TaskChecklistService } from './services/task-checklist.service';
import { TaskDependencyService } from './services/task-dependency.service';
import { TaskTimeTrackingService } from './services/task-time-tracking.service';
import { TaskCustomFieldService } from './services/task-custom-field.service';
import { TaskTemplateService } from './services/task-template.service';
import { TaskSubtaskService } from './services/task-subtask.service';

// Controllers
import {
  TasksController,
  TaskCommentController,
  TaskAttachmentController,
  TaskDashboardController,
  TaskEmployeeController,
} from './controllers';
import { TaskChecklistController } from './controllers/task-checklist.controller';
import { TaskDependencyController } from './controllers/task-dependency.controller';
import { TaskTimeTrackingController } from './controllers/task-time-tracking.controller';
import { TaskCustomFieldController } from './controllers/task-custom-field.controller';
import { TaskTemplateController } from './controllers/task-template.controller';
import { TaskActivityController } from './controllers/task-activity.controller';
import { TaskSubtaskController } from './controllers/task-subtask.controller';

import { RbacModule } from '../rbac/modules/rbac.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Task,
      TaskSequence,
      TaskStatus,
      TaskPriority,
      TaskAssignee,
      TaskActivity,
      TaskComment,
      TaskAttachment,
      TaskLabel,
      TaskLabelMap,
      TaskChecklist,
      TaskCustomField,
      TaskCustomFieldValue,
      TaskTimeLog,
      TaskDependency,
      TaskRecurrence,
      TaskRecurrenceException,
      TaskTemplate,
      TaskTemplateItem,
      TaskSlaRule,
      TaskStatusTransition,
      TaskCommentMention,
      TaskCommentHistory,
      Employee,
      User,
    ]),
    RbacModule,
  ],
  providers: [
    { provide: 'IStorageProvider', useClass: LocalStorageProvider },
    // Repositories
    TaskRepository,
    TaskQueryRepository,
    TaskActivityRepository,
    TaskCommentRepository,
    TaskAttachmentRepository,
    TaskChecklistRepository,
    TaskDependencyRepository,
    TaskTimeLogRepository,
    TaskCustomFieldRepository,
    TaskTemplateRepository,
    TaskStatusTransitionRepository,
    // Services
    TasksService,
    TaskActivityService,
    TaskCommentService,
    TaskAttachmentService,
    TaskHealthService,
    TaskDueDateService,
    TaskViewService,
    TaskChecklistService,
    TaskDependencyService,
    TaskTimeTrackingService,
    TaskCustomFieldService,
    TaskTemplateService,
    TaskSubtaskService,
  ],
  controllers: [
    TaskDashboardController,
    TasksController,
    TaskCommentController,
    TaskAttachmentController,
    TaskEmployeeController,
    TaskChecklistController,
    TaskDependencyController,
    TaskTimeTrackingController,
    TaskCustomFieldController,
    TaskTemplateController,
    TaskActivityController,
    TaskSubtaskController,
  ],
  exports: [SequelizeModule, TasksService],
})
export class TasksModule {}
