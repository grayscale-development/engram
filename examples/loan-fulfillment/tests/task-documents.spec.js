import { ExistingDocumentPicker } from '../src/frontend/tasks/ExistingDocumentPicker.js';

export async function existingDocumentCanSatisfyTask() { return ExistingDocumentPicker({ task: { id: 'task-1' }, loan: { id: 'loan-1' } }); }
