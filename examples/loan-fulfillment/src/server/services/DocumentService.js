import { LoanDocumentRepository } from '../stores/LoanDocumentRepository.js';

export const DocumentService = {
  attachToTask: (taskId, documentId) => LoanDocumentRepository.linkTask(taskId, documentId),
  uploadForTask: (taskId, file) => LoanDocumentRepository.create(taskId, file)
};
