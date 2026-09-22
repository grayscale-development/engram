import { TaskService } from '../services/TaskService.js';

export const attachExistingDocument = (request) => TaskService.attachExistingDocument(request.taskId, request.documentId, request.user);
export const uploadDocument = (request) => TaskService.uploadDocument(request.taskId, request.file, request.user);
