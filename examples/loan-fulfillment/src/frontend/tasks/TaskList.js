import { TaskModal } from './TaskModal.js';

export function TaskList({ tasks, loan }) { return tasks.map((task) => TaskModal({ task, loan })); }
