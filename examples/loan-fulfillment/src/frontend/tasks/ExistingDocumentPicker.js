import { listLoanDocuments, attachExistingDocument } from '../api/taskApi.js';

export async function ExistingDocumentPicker({ task, loan }) {
  const documents = await listLoanDocuments(loan.id);
  return { documents, select: (document) => attachExistingDocument(task.id, document.id) };
}
