import { DocumentService } from './DocumentService.js';
import { authorizeTaskAccess } from './authorization.js';

export const TaskService = {
  attachExistingDocument(taskId, documentId, user) { authorizeTaskAccess(taskId, user); return DocumentService.attachToTask(taskId, documentId); },
  uploadDocument(taskId, file, user) { authorizeTaskAccess(taskId, user); return DocumentService.uploadForTask(taskId, file); }
};
