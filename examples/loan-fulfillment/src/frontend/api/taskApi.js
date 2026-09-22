export const listLoanDocuments = (loanId) => ({ path: `/loans/${loanId}/documents` });
export const attachExistingDocument = (taskId, documentId) => ({ path: `/tasks/${taskId}/documents/${documentId}`, method: 'POST' });
export const uploadTaskDocument = (taskId, file) => ({ path: `/tasks/${taskId}/documents`, method: 'POST', file });
