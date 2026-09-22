import { uploadTaskDocument } from '../api/taskApi.js';

export function TaskDocuments({ task }) { return { upload: (file) => uploadTaskDocument(task.id, file) }; }
