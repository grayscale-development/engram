import { TaskList } from '../tasks/TaskList.js';

export function LoanPage({ loan }) { return TaskList({ tasks: loan.tasks, loan }); }
