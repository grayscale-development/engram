import { ExistingDocumentPicker } from './ExistingDocumentPicker.js';
import { TaskDocuments } from './TaskDocuments.js';

export function TaskModal({ task, loan }) {
  return { title: task.title, documents: TaskDocuments({ task, loan }), existing: ExistingDocumentPicker({ task, loan }) };
}
